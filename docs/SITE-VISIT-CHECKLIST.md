# MikroTik site visit — offline checklist

Take this with you. Nothing here needs internet: every command runs on the
router itself, over Winbox or a direct cable. Work top to bottom.

**Open a terminal first:** Winbox → connect to the router → **New Terminal**.
(Or SSH to the router's IP.)

**Copying output:** in Winbox you can select terminal text and press Ctrl+C.
If that is awkward, every step below also writes to a file you can drag off the
router from Winbox → **Files**. Take phone photos as a backup — blurry output is
better than a second trip.

---

## STEP 0 — Write these down first

```
Router model:            ______________________
RouterOS version:        ______________________
Router's LAN IP:         ______________________
Winbox/admin username:   ______________________
```

Get model and version with:

```
/system resource print
```

---

## STEP 1 — The public IP test  ← the important one

This decides whether the dashboard can ever reach your router from the internet.

```
/ip address print
```

Write down the address on the WAN interface (the one facing Starlink):

```
WAN address: ______________________
```

Then ask MikroTik's own service what the outside world sees:

```
/ip cloud set ddns-enabled=yes
/ip cloud print
```

Write down the `public-address` line:

```
public-address: ______________________
dns-name:       ______________________
```

**What it means** (note it, but bring both numbers back either way):

- The two addresses **match** → you have a public IP. Everything can work from
  the cloud dashboard.
- They **differ**, or the WAN address starts `100.64.` through `100.127.` →
  CGNAT. The dashboard cannot dial in; we use a tunnel or run it on-site.

---

## STEP 2 — Turn on the API

The API is already in the router. It only needs enabling.

```
/ip service print
```

Note whether `api` and `api-ssl` show as disabled. Then:

```
/ip service enable api
/ip service enable api-ssl
/ip service print
```

Copy the whole table.

---

## STEP 3 — Create a dedicated API user

Do not reuse your admin login for this.

**Choose a long password now and write it here — it is not recoverable later:**

```
API password: ______________________________________
```

Then (replace `PUT-PASSWORD-HERE` with what you just wrote):

```
/user group add name=voucher-api policy=api,read,write,test
/user add name=voucher-api group=voucher-api password=PUT-PASSWORD-HERE
/user print
```

Confirm `voucher-api` appears in the list.

---

## STEP 4 — Capture your hotspot setup

The dashboard's packages must match the profile names on the router exactly,
so this list matters.

```
/ip hotspot print
/ip hotspot profile print
/ip hotspot user profile print
```

Copy all three. Write the profile names here:

```
Profiles: _________________________________________________
          _________________________________________________
```

Check whether accounting is on — without it, usage figures are impossible:

```
/ip hotspot user profile print detail
```

Look for `accounting=` on each profile. Note any that say `no`.

---

## STEP 5 — Export your existing vouchers  ← bring this file back

How many you have:

```
/ip hotspot user print count-only
```

```
Voucher count: ______________
```

Now export them:

```
/ip hotspot user export file=vouchers
```

This creates **`vouchers.rsc`** on the router.

**Get the file off the router:** Winbox → **Files** → find `vouchers.rsc` →
drag it onto your desktop, or right-click → Download. Copy it to a USB stick
as well if you can.

That single file is the whole point of the trip — it is your entire voucher
stock, and the dashboard imports it directly.

If `export` is unavailable on your version, use this instead and take the file
the same way:

```
/ip hotspot user print detail file=vouchers
```

---

## STEP 6 — Active sessions right now (optional, useful)

```
/ip hotspot active print
```

Tells us whether accounting is producing real numbers.

---

## STEP 7 — If STEP 1 showed a PUBLIC IP, do this too

Only if the two addresses matched. Skip otherwise.

```
/ip firewall filter print
```

Copy the output. Do **not** open any port yet — we will add a rule restricted
to one source address rather than exposing the API to the whole internet.

---

## Bring back

- [ ] `vouchers.rsc` — the export file (**most important**)
- [ ] STEP 1: both addresses
- [ ] STEP 2: the `/ip service print` table
- [ ] STEP 3: the API password you chose
- [ ] STEP 4: profile names, and which have accounting off
- [ ] STEP 5: voucher count
- [ ] STEP 6: active sessions output
- [ ] Router model + RouterOS version

---

## If something goes wrong

- **A command errors** — write down the exact message and move on. Nothing here
  is destructive; a failed command changes nothing.
- **`/ip cloud` not available** — older RouterOS. Skip it; the WAN address from
  STEP 1 plus the `100.64–100.127` rule still answers the question.
- **Locked out after STEP 2 or 3** — you have not changed your own login.
  Adding a user and enabling a service cannot lock you out.
- **To undo everything:**
  ```
  /ip service disable api
  /ip service disable api-ssl
  /user remove voucher-api
  /user group remove voucher-api
  ```

Nothing in this checklist touches your hotspot, your existing vouchers, or any
connected customer. Customers stay online throughout.
