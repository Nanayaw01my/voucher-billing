# =============================================================================
#  EUNISET LOVE — EVERYTHING, for a brand new MikroTik
#
#  One file. Factory-reset router in, working hotspot out.
#
#  This is mikrotik-build-complete.rsc plus every fix found while getting the
#  first site live: the device lock, the expiry clock, resident accounts, and a
#  VERIFY section that checks the one rule whose absence is invisible.
#
#  BEFORE YOU START
#
#    1. Reset the router:  /system reset-configuration no-defaults=yes skip-backup=yes
#       It reboots and comes back with no password on "admin".
#    2. Connect by MAC in WinBox (Neighbors tab) -- there is no IP yet.
#    3. Change the two passwords below: block 1 (admin) and block 9 (API).
#    4. Paste block by block, in order. Read what each prints.
#
#  THE HOTSPOT PAGES ARE NOT IN THIS FILE. After block 11, upload all eight
#  files from docs/hotspot-pages/ into Files -> hotspot/ in WinBox:
#
#      login.html  rlogin.html  flogin.html  redirect.html
#      alogin.html status.html  logout.html  error.html
#
#  All eight. RouterOS serves rlogin.html first on interception and flogin.html
#  when cookies are refused; shipping only login.html gives a 404 and no login
#  page, which is how a day was lost the first time.
# =============================================================================


# ---- 1 -- identity and the admin password -----------------------------------
/system identity set name="EUNISET-LOVE-HOTSPOT"
/user set [find name=admin] password="CHANGE-ME-admin-password"


# ---- 2 -- bridge every LAN port ---------------------------------------------
# ether1 is left out: that is the Starlink side. Every other ethernet port is
# added automatically, whatever the router has, so no port list to edit.
/interface bridge add name=bridge-hotspot comment="hotspot LAN"

:foreach i in=[/interface ethernet find] do={
  :local portName [/interface ethernet get $i name];
  :if ($portName != "ether1") do={
    /interface bridge port add bridge=bridge-hotspot interface=$portName;
    :put ("bridged: " . $portName);
  }
}


# ---- 3 -- WAN: take an address from Starlink --------------------------------
/ip dhcp-client add interface=ether1 disabled=no comment="Starlink WAN"


# ---- 4 -- LAN addressing ----------------------------------------------------
# 10.5.50.x on purpose: Starlink's own router uses 192.168.1.x and would clash.
/ip address add address=10.5.50.1/24 interface=bridge-hotspot
/ip pool add name=hotspot-pool ranges=10.5.50.10-10.5.50.254
/ip dhcp-server add name=hotspot-dhcp interface=bridge-hotspot address-pool=hotspot-pool lease-time=1h disabled=no
/ip dhcp-server network add address=10.5.50.0/24 gateway=10.5.50.1 dns-server=10.5.50.1


# ---- 5 -- DNS and clock -----------------------------------------------------
/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes
/system ntp client set enabled=yes
/system ntp client servers add address=time.cloudflare.com
/system clock set time-zone-name=Africa/Accra


# ---- 6 -- NAT ---------------------------------------------------------------
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade


# ---- 7 -- hotspot server ----------------------------------------------------
/ip hotspot profile add name=eunisetlove-profile hotspot-address=10.5.50.1 html-directory=hotspot login-by=http-pap use-radius=no
# idle-timeout=none, not the RouterOS default of 5m. A customer who buys 24
# hours and puts their phone in their pocket for ten minutes was being cut off
# and asked for their code again -- and because the voucher profiles set
# add-mac-cookie=no, "again" means typing it. The voucher still worked, but it
# reads as a broken voucher to the customer and it is the seller who hears it.
#
# keepalive-timeout=2m does the job idle-timeout was wrongly doing. The router
# pings the device: quiet but present keeps the session, genuinely gone ends
# it. Without it, both timeouts off means a session never ends until the
# voucher expires -- which for a RESIDENT account is never, so ghost sessions
# would pile up against shared-users=2 and lock a resident out of their own
# account.
/ip hotspot add name=eunisetlove-hotspot interface=bridge-hotspot address-pool=hotspot-pool profile=eunisetlove-profile addresses-per-mac=1 idle-timeout=none keepalive-timeout=2m disabled=no


# ---- 8 -- the eight voucher profiles ----------------------------------------
# These names must match the packages in the dashboard exactly.
# rate-limit is upload/download as the customer experiences it. Tune to what
# your Starlink link carries, divided by expected simultaneous users.
/ip hotspot user profile add name=VOUCHER-1H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-3H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-6H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-12H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-24H-1CODE shared-users=1 add-mac-cookie=no rate-limit="2M/5M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-1GB shared-users=1 add-mac-cookie=no rate-limit="3M/8M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-2GB shared-users=1 add-mac-cookie=no rate-limit="3M/8M" status-autorefresh=1m
/ip hotspot user profile add name=VOUCHER-5GB shared-users=1 add-mac-cookie=no rate-limit="4M/10M" status-autorefresh=1m


# ---- 9 -- the dashboard's API account ---------------------------------------
/user group add name=voucher-api policy=api,read,write,test,winbox
/user add name=voucher-api group=voucher-api password="CHANGE-ME-api-password"
/ip service set api port=8728 disabled=no
/ip service set api-ssl port=8729 disabled=no
/ip service set telnet disabled=yes
/ip service set ftp disabled=yes
/ip service set www disabled=yes


# ---- 10 -- firewall ---------------------------------------------------------
/ip firewall filter add chain=input action=accept connection-state=established,related
/ip firewall filter add chain=input action=drop connection-state=invalid
/ip firewall filter add chain=input action=accept protocol=icmp
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=udp dst-port=53
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=53
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=80,443
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=8728,8729 src-address=10.5.50.0/24
/ip firewall filter add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=8291
/ip firewall filter add chain=input action=drop in-interface=ether1
/ip firewall filter add chain=forward action=accept connection-state=established,related
/ip firewall filter add chain=forward action=drop connection-state=invalid
/ip firewall filter add chain=forward action=drop connection-state=new in-interface=ether1


# ---- 11 -- walled garden and a test voucher ---------------------------------
/ip hotspot user add name=TEST1234 password=TEST1234 profile=VOUCHER-1H-1CODE limit-uptime=1h


# =============================================================================
#  12 -- WiFi. RUN ONLY THE BLOCK THAT MATCHES YOUR ROUTER.
#
#  Find out which you have first:
#
#      /interface print
#
#  Then look at the names in the list:
#
#    * you see "wlan1"            -> the router has WiFi on the older driver
#                                    (hAP ac2, hAP lite, most RouterOS 6 gear)
#                                    -> run block 12A
#    * you see "wifi1"            -> WiFi on the newer RouterOS 7 driver
#                                    (hAP ax series)
#                                    -> run block 12B
#    * you see neither            -> no built-in WiFi. Your outdoor access
#                                    point provides the signal; nothing to do.
#                                    -> skip to VERIFY
# =============================================================================

# ---- 12A -- older wireless driver (wlan1) -----------------------------------
# /interface wireless security-profiles add name=hotspot-open mode=none
# /interface wireless set [find default-name=wlan1] ssid="EUNISET LOVE" mode=ap-bridge band=2ghz-b/g/n channel-width=20/40mhz-Ce security-profile=hotspot-open disabled=no
# /interface bridge port add bridge=bridge-hotspot interface=wlan1

# ---- 12B -- newer RouterOS 7 driver (wifi1) ---------------------------------
# /interface wifi security add name=hotspot-open authentication-types=""
# /interface wifi configuration add name=hotspot-cfg ssid="EUNISET LOVE" security=hotspot-open mode=ap
# /interface wifi set [find default-name=wifi1] configuration=hotspot-cfg disabled=no
# /interface bridge port add bridge=bridge-hotspot interface=wifi1

# The WiFi is deliberately OPEN -- no WiFi password. Customers connect freely,
# then the hotspot login page asks for their voucher. Putting a WPA password on
# top would mean telling every customer two secrets instead of one.



# =============================================================================
#  13 -- lock each voucher to one device, and expire it 24h after first use
#
#  Without this a voucher is reusable forever by anyone it is passed to, and
#  a 24-hour code is 24 hours of CONNECTED time rather than a day, so it can
#  be stretched over weeks. This closes both.
# =============================================================================


# How long a data-only voucher (no limit-uptime) stays valid after first use.
:global vfuFallbackWindow 7d

/system script
remove [find name="voucher-first-use"]
add name="voucher-first-use" dont-require-permissions=no policy=read,write,test source={
  :global vfuUser
  :global vfuMac
  :global vfuFallbackWindow

  :if ([:len $vfuUser] = 0) do={
    :log warning "voucher-first-use: called with no user"
  } else={
    :local id [/ip hotspot user find name=$vfuUser]

    :if ([:len $id] = 0) do={
      :log warning ("voucher-first-use: no such voucher " . $vfuUser)
    } else={

      # --- 1. lock the voucher to the first device that uses it -----------
      # An unset mac-address reads back differently across RouterOS builds,
      # so treat empty, absent and all-zeroes alike as "not yet claimed".
      :local claimed [/ip hotspot user get $id mac-address]
      :if (([:typeof $claimed] = "nothing") or ($claimed = "") or \
           ($claimed = "00:00:00:00:00:00")) do={
        /ip hotspot user set $id mac-address=$vfuMac
        :log info ("voucher " . $vfuUser . " locked to device " . $vfuMac)
      } else={
        :log info ("voucher " . $vfuUser . " already claimed by " . $claimed)
      }

      # --- 2. start the countdown, once and only once ---------------------
      :local sched ("expire-" . $vfuUser)
      :if ([:len [/system scheduler find name=$sched]] = 0) do={

        :local window [/ip hotspot user get $id limit-uptime]
        :if ($window = 0s) do={ :set window $vfuFallbackWindow }

        # When it fires: disable the voucher, cut the session, remove itself.
        /system scheduler add name=$sched interval=$window \
          comment="EUNISET LOVE voucher expiry" \
          on-event=("/ip hotspot user set [find name=\"" . $vfuUser . "\"] disabled=yes; \
                     /ip hotspot active remove [find user=\"" . $vfuUser . "\"]; \
                     /system scheduler remove [find name=\"" . $sched . "\"]")

        :log info ("voucher " . $vfuUser . " starts now, expires in " . $window)
      }
    }
  }
}

# Hand the login details to that script.
#
# NOTE ON WHERE THIS GOES: on-login is a property of /ip hotspot USER profile
# (the per-package profile carrying rate-limit and shared-users), NOT of
# /ip hotspot profile (the server profile carrying login-by and
# html-directory). Setting it on the latter fails with
# "expected end of command".
#
# Applied to every VOUCHER-* user profile at once, so all eight packages get
# it and any profile added later needs this line re-run.
/ip hotspot user profile
set [find name~"VOUCHER"] on-login=":global vfuUser \$user; :global vfuMac \$\"mac-address\"; /system script run voucher-first-use"


# =============================================================================
#  14 -- resident accounts (OPTIONAL)
#
#  For people at your place who use the WiFi every day and pay monthly, rather
#  than customers buying an hour. No clock: the account works until you disable
#  it. Skip this block if you only sell vouchers.
#
#  Named RESIDENT, deliberately not VOUCHER-*, so the on-login line in block 13
#  (which matches name~"VOUCHER") never attaches an expiry countdown to it.
# =============================================================================

/ip hotspot user profile
add name=RESIDENT shared-users=2 add-mac-cookie=yes rate-limit="4M/10M" status-autorefresh=1m

# Remembered devices last 30 days. This lives on the SERVER profile, so it is
# shared by everyone -- safe only because every VOUCHER-* profile sets
# add-mac-cookie=no and so never creates a cookie for it to apply to. Turn a
# cookie on for a voucher profile and a 24-hour code becomes a 30-day one.
/ip hotspot profile set [find] mac-cookie-timeout=30d

/system script
remove [find name="resident-first-use"]
add name="resident-first-use" dont-require-permissions=no policy=read,write,test source={
  :global rfuUser
  :global rfuMac
  :if ([:len $rfuUser] > 0) do={
    :local id [/ip hotspot user find name=$rfuUser]
    :if ([:len $id] > 0) do={
      :local c [/ip hotspot user get $id mac-address]
      :if (([:typeof $c] = "nothing") or ($c = "") or ($c = "00:00:00:00:00:00")) do={
        /ip hotspot user set $id mac-address=$rfuMac
        :log info ("resident " . $rfuUser . " locked to " . $rfuMac)
      }
    }
  }
}

/ip hotspot user profile
set [find name="RESIDENT"] on-login=":global rfuUser \$user; :global rfuMac \$\"mac-address\"; /system script run resident-first-use"

# Add people. The login page has ONE field: whatever is typed is sent as both
# username and password, and upper-cased first. So name and password must be
# IDENTICAL and UPPERCASE.
#
#   /ip hotspot user add name="KWAME2026" password="KWAME2026" profile=RESIDENT
#
# Stop someone:
#   /ip hotspot user set [find name="KWAME2026"] disabled=yes
#   /ip hotspot active remove [find user="KWAME2026"]
# Start them again:
#   /ip hotspot user set [find name="KWAME2026"] disabled=no


# =============================================================================
#  VERIFY — run every line and read the output
# =============================================================================
#
#  /interface print
#  /ip address print                     ether1 has a 100.64-100.127 address
#  /ip hotspot print                     one server, not disabled
#  /ip hotspot user profile print        EIGHT voucher profiles
#  /ip service print                     api enabled on 8728
#  /system script print                  voucher-first-use present
#
#  THE ONE THAT HIDES -- do not skip it:
#
#  /ip firewall nat print where !dynamic
#
#  There must be a line reading:
#      chain=srcnat action=masquerade out-interface=ether1
#
#  Every other NAT rule carries a D flag because the hotspot creates it. This
#  one you add, so this one can be missing -- and when it is, customers log in
#  SUCCESSFULLY, appear in Active, and no data moves. The hotspot looks
#  perfect. On iPhone the captive sheet stays open with an X (iOS re-checks
#  after login, still finds nothing), and that X is Cancel, so closing it
#  leaves the network. It reads as "it disconnects when I close the login
#  page", which points nowhere near NAT.
#
#  Missing:
#      /ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade
#
#  THEN, IN ORDER:
#
#  1. /ping 8.8.8.8 count=5      over the CABLE, not WiFi. Over WiFi you are
#                                 also measuring the WiFi link, which once
#                                 produced a convincing 78% loss that had
#                                 nothing to do with the connection.
#  2. /ping google.com count=5   names resolve
#  3. Upload the eight hotspot pages if you have not (see the top of this file)
#  4. Connect a phone. The login page should appear by itself.
#  5. Sign in with TEST1234 / TEST1234
#  6. Open a browser properly and load a site -- this is the real test
#  7. /ip hotspot active print   your phone is listed
#  8. /ip hotspot user print detail where name="TEST1234"
#        mac-address should now be stamped -- that is the device lock working
#  9. /ip hotspot user remove [find name=TEST1234]
#
#  Then import your vouchers, and set up the access point per
#  docs/access-point-setup.md. The check that matters there: a phone on the
#  AP's SSID must get 10.5.50.x. If it gets 192.168.x.x the AP is still in
#  Router mode and never reaches the hotspot.
#
#  If something is wrong later, docs/five-minute-health-check.md finds it in
#  the order faults actually happen.
# =============================================================================
