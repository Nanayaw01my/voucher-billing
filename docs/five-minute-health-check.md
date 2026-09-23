# Five-minute health check

Run this when someone says "the WiFi isn't working". It goes outward from the
router, and the first line that fails is the answer -- so do not skip ahead.

Every one of these was a real fault on this network at some point.

---

## 1. Does the MikroTik have an address from Starlink?

```
/ip address print
```

`ether1` should carry an address, normally `100.64.x.x` to `100.127.x.x`
(Starlink's range).

**Nothing on ether1** -> cable in the wrong port, or Starlink is down. Stop
here; nothing below can work.

## 2. Does the router itself reach the internet?

```
/ping 8.8.8.8 count=5
```

Do this from **WinBox over the ethernet cable**. Over WiFi you are also
measuring the WiFi link, which once produced a convincing 78% packet loss that
had nothing to do with the internet connection.

Want 0% loss. `host unreachable` means the thing ether1 is plugged into has no
internet -- that is upstream of you entirely.

## 3. Do names resolve?

```
/ping google.com count=5
```

Pings to 8.8.8.8 work but names fail -> DNS:

```
/ip dns set servers=1.1.1.1,8.8.8.8
/ip dns cache flush
```

## 4. Is traffic being translated out? -- THE ONE THAT HIDES

```
/ip firewall nat print where !dynamic
```

You need this line:

```
chain=srcnat action=masquerade out-interface=ether1
```

Without it customers log in **successfully** and get nothing. The hotspot looks
perfect, the voucher is accepted, the session appears in Active -- and no data
moves. On iPhone the captive sheet stays open with an X instead of closing
itself, because iOS re-checks the connection after login, still finds no
internet, and keeps the sheet up. Pressing that X is Cancel, so the phone leaves
the network, which reads as "it disconnects when I close the page".

Missing:

```
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade
```

Everything printed with a `D` flag is created by the hotspot automatically. The
masquerade rule is the one you add yourself, so it is the one that can be
absent.

## 5. Is the hotspot serving?

```
/ip hotspot print
/ip hotspot active print
```

A logged-in phone should appear in Active. If it does and there is still no
internet, go back to step 4 -- that is the symptom.

## 6. Is the access point bridging?

Check the address a phone gets on the Ruijie's SSID.

- `10.5.50.x` -> correct
- `192.168.x.x` -> the AP is in Router mode or running its own DHCP, so the
  phone never reaches the hotspot. See `access-point-setup.md`.

---

## Reading what customers tell you

| What they say | Usually means | Check |
|---|---|---|
| "Connected, no internet" before typing a code | Nothing. That is what a captive portal looks like. | -- |
| Logs in, then nothing loads | Masquerade rule | 4 |
| Login page never appears, phone has 192.168.x.x | Access point | 6 |
| Login page never appears, phone has 10.5.50.x | Upstream internet | 1-3 |
| Was working, now nothing at all | Starlink | 1-2 |
