---
title: "Kerberoasting Internals — From TGS-REQ to Offline Crack"
description: "A low-level dissection of the Kerberos TGS exchange, how SPN enumeration generates crackable RC4 tickets, and what telemetry defenders see when you do it wrong."
pubDate: 2025-01-15
tags: [kerberos, active-directory, credential-access]
---

## Protocol Foundation

Kerberoasting sits at the intersection of two design decisions made in the original MIT Kerberos spec: **any authenticated domain user** can request a TGS ticket for any SPN, and the ticket's session key is encrypted with the service account's long-term secret — which is derivable from the account's NTLM hash.

The attack is not a vulnerability. It is protocol behaviour.

### The TGS Exchange in Detail

When a client requests a service ticket, it sends a **TGS-REQ** to the KDC. The relevant fields are:

```
TGS-REQ {
  padata:   PA-TGS-REQ (your TGT, encrypted with the KDC's krbtgt key)
  req-body: {
    sname:  <target SPN>
    etype:  [17, 18, 23]   ← encryption types the client claims to support
  }
}
```

The KDC replies with a **TGS-REP** containing two components:

| Component | Encrypted with | Contents |
|-----------|---------------|----------|
| `enc-part` (outer) | client's session key from TGT | session key for the service |
| `ticket` | **service account's key** | session key, PAC, validity |

The crackable blob is the `ticket.enc-part`. If the service account uses an RC4 key (etype 23), that encrypted blob can be taken offline and attacked with Hashcat.

### Forcing RC4 Downgrade

Modern environments default to AES256 (etype 18). You can force a weaker encryption by setting only etype 23 in your `req-body.etype` list. Most KDCs will honour the downgrade:

```python
# Using impacket's GetUserSPNs
# -request-user filters to a single SPN
# The raw TGS is dumped in $krb5tgs$23$ format ready for Hashcat mode 13100

python3 GetUserSPNs.py \
  CORP.LOCAL/jdoe:P@ssw0rd \
  -request \
  -outputfile tgs_hashes.txt \
  -dc-ip 10.10.10.1
```

> **Forge note:** the etype 23 downgrade generates event `4769` with *Ticket Encryption Type: 0x17*. This is the most reliable Kerberoasting detection signal. Requesting etype 18 silently avoids this field being anomalous.

## SPN Enumeration OpSec

Before requesting tickets, you need a list of accounts with SPNs registered. The naive approach is an LDAP query for `(servicePrincipalName=*)` — which is fully logged by many SIEM configurations.

### Lower-Noise Alternatives

**LDAP paging with small result sets** — spread enumeration across multiple sessions and time windows rather than a single large query dump.

**SAMR interface** — use the Security Account Manager Remote Protocol to enumerate accounts without touching LDAP. Less commonly monitored.

**Read from BloodHound data** — if you've already ingested AD objects via SharpHound, all SPN-bearing accounts are present in the graph. No further enumeration needed.

## Cracking Strategy

RC4 service tickets crack at approximately **1.2 billion candidates/sec** on an RTX 4090 using Hashcat mode 13100.

```bash
hashcat -m 13100 tgs_hashes.txt rockyou.txt \
  -r rules/best64.rule \
  --potfile-path kerberoast.pot
```

For AES256 tickets (mode 19700), expect roughly **150–200 million/sec** — still viable for weak passwords.

> **Target selection matters:** prioritise SPNs registered on accounts with high privilege (Tier-0 service accounts, accounts with DCSync rights). The cracking effort is identical regardless of account privilege, but the operational value is not.

## Detection Signals

| Event | ID | Anomaly |
|-------|-----|---------|
| TGS-REQ with etype 0x17 | 4769 | RC4 for modern service |
| Volume of TGS requests | 4769 | >N tickets in short window |
| Requesting account has no service-facing role | 4769 | Low-priv account requesting admin SPN |
| KDC-aware honeypot SPNs | 4769 | Any request for decoy SPN |

The most operationally robust Kerberoasting detection chains event 4769 to account context — was the requesting account's last logon from a workstation, not a server? Does it have business justification for accessing that service?

## Further Reading

- RFC 4120 — The Kerberos Network Authentication Service (V5)
- Tim Medin's original DerbyCon 2014 talk
- Will Schroeder's Kerberoasting Without Mimikatz post
