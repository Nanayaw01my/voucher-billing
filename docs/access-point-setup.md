# Setting up the access point (Ruijie / Reyee, and any other brand)

```
Starlink  ->  MikroTik  ->  Ruijie AP  ->  customers
              ^^^^^^^^      ^^^^^^^^^
              does all      does nothing but
              the thinking  carry the signal
```

The MikroTik runs the hotspot: the login page, the vouchers, the speed limits,
the accounting. The access point's only job is to put that network on the air.

Everything below is about making the Ruijie do **less**, not more. Every feature
it has for authentication, addressing or routing must be off, because the
MikroTik is already doing it and two devices doing it at once is what breaks.

---

## The four settings that matter

### 1. Work mode: AP, not Router

Reyee devices ship in **Router mode**, where the AP does its own NAT and hands out
its own addresses. In that mode your customers get an address from the Ruijie,
never reach the MikroTik's hotspot, and never see a login page — they either get
unpaid internet or nothing at all.

Set **Work Mode** (sometimes "Operating Mode") to **AP mode** or **Bridge mode**.
On Reyee this is usually under *More → Work Mode*, or offered during the setup
wizard on first boot.

### 2. DHCP server: OFF

This is the single most common cause of "the login page never appears".

If the AP is handing out addresses, the customer's phone gets its gateway and DNS
from the AP instead of from the MikroTik — and the hotspot only intercepts
traffic that comes through it. Turn the AP's DHCP server off completely. The
MikroTik is the only thing on this network that should be assigning addresses.

Switching to AP mode usually disables it, but check it explicitly afterwards.

### 3. WiFi security: open, no password

Leave the SSID **open**. No WPA, no password.

The voucher is the credential. A customer connects freely, the login page asks
for their code, and that is the one secret they have to be told. Putting a WiFi
password on top means handing every customer two secrets and answering "what is
the WiFi password?" all day.

Set the SSID to something customers will recognise, e.g. `EUNISET LOVE`.

### 4. Built-in captive portal / web authentication: OFF

Ruijie Reyee has its own guest authentication, voucher and portal features. They
compete with the MikroTik hotspot for the same job. Turn all of it off:
any "Web Authentication", "Captive Portal", "Guest WiFi" or built-in voucher
system on the AP.

---

## Management address

Give the AP a fixed address on the MikroTik's network so you can always reach its
admin page:

- Static, outside the DHCP pool: **10.5.50.2**, mask `255.255.255.0`,
  gateway `10.5.50.1`, DNS `10.5.50.1`
- The pool starts at `10.5.50.10`, so `.2` through `.9` are free for equipment

Reyee's own management address before you change it is commonly **192.168.110.1**
— check the label on the device. You may need to set your laptop to a matching
address to reach it the first time.

Record it here once set:

```
AP management IP:  ______________________
AP admin password: ______________________
```

---

## Cabling

Plug the Ruijie into **any port except ether1** on the MikroTik. `ether1` is the
Starlink side.

The build script bridges every other port automatically, so it does not matter
which one you choose. If the AP takes PoE, power it from a PoE injector or a
PoE-capable port as the model requires.

---

## Checking it worked

1. Connect a phone to the SSID.
2. Check the address it received — it must be **10.5.50.something**. If it is
   192.168.x.x, the AP is still running DHCP or still in Router mode. Go back to
   settings 1 and 2.
3. A **"Sign in to network"** notification should appear, or opening any page
   should land on the voucher login.
4. Sign in with the test voucher. You should get internet.
5. On the MikroTik, confirm the session is real:

   ```
   /ip hotspot active print
   ```

---

## If the login page never appears

| Symptom | Cause | Fix |
|---|---|---|
| Phone gets a 192.168.x.x address | AP is in Router mode, or its DHCP is on | Settings 1 and 2 |
| Phone gets 10.5.50.x but no login page | AP is fine; check the hotspot is running on the MikroTik with `/ip hotspot print` | — |
| Internet works without any login | Traffic is bypassing the hotspot — the AP is routing rather than bridging | Setting 1 |
| Login page appears but the code is rejected | The voucher does not exist on this router, or its profile name does not match | `/ip hotspot user print` |
| A second login page, not yours | The AP's own portal is still enabled | Setting 4 |

---

## Other brands

The names differ, the requirements do not. Any access point — TP-Link, Ubiquiti,
Cudy, Tenda — needs the same four things: **AP/bridge mode, DHCP off, open SSID,
its own portal off.** If an AP is doing any thinking of its own, it is
misconfigured for this setup.
