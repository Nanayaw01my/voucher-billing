# =============================================================================
#  EUNISET LOVE — resident accounts
#
#  For the people at your place: neighbours, family, tenants, the shop next
#  door. Not tourists buying an hour -- people who are there every day and
#  should each have their own code.
#
#  A resident account differs from a voucher in one way that matters: it has
#  NO CLOCK. It works until you switch it off. You end it when they stop
#  paying, not when a timer fires.
#
#  WHY NOT JUST MAKE A 1-YEAR VOUCHER
#
#  Two reasons, both of which would cost you money quietly:
#
#    1. limit-uptime counts CONNECTED time, not calendar time. limit-uptime=365d
#       is 365 days actually online. Someone using four hours a day would get
#       roughly six years out of it.
#
#    2. voucher-first-use turns limit-uptime into a countdown, and a reboot
#       restarts that countdown from the beginning. At 24 hours a power cut
#       costs you a day. At a year it means the account never expires at all,
#       and you would have no way of noticing.
#
#  So residents get no timer. You keep the control instead of the router.
#
#  Install:  upload, then  /import file-name=resident-accounts.rsc
# =============================================================================


# --- the profile -------------------------------------------------------------
#
# Named RESIDENT-*, deliberately NOT VOUCHER-*. The on-login line in
# voucher-first-use.rsc applies itself to [find name~"VOUCHER"], so a profile
# named this way is untouched by it and gets no expiry countdown.
#
# shared-users=2 lets one person use a phone and a laptop at once, which is
# what a resident expects and a tourist does not. Set it to 1 if you want one
# device only; raise it for a household sharing a single account.
#
# rate-limit is upload/download. These are faster than the voucher profiles
# because residents are paying monthly, not by the hour. Adjust to taste.

/ip hotspot user profile
remove [find name="RESIDENT"]
add name=RESIDENT shared-users=2 add-mac-cookie=no rate-limit="4M/10M" \
    status-autorefresh=1m


# --- the device lock ---------------------------------------------------------
#
# Residents still get locked to their own devices, so a code cannot be passed
# around the neighbourhood. Same idea as voucher-first-use, but the locking
# half only -- no scheduler, no expiry.
#
# With shared-users=2 the lock binds the FIRST device. The second device shares
# the session rather than claiming the code. If you want two specific devices
# each locked, give that person two accounts instead.

/system script
remove [find name="resident-first-use"]
add name="resident-first-use" dont-require-permissions=no policy=read,write,test source={
  :global rfuUser
  :global rfuMac

  :if ([:len $rfuUser] = 0) do={
    :log warning "resident-first-use: called with no user"
  } else={
    :local id [/ip hotspot user find name=$rfuUser]

    :if ([:len $id] = 0) do={
      :log warning ("resident-first-use: no such account " . $rfuUser)
    } else={
      # An unset mac-address reads back differently across RouterOS builds,
      # so treat empty, absent and all-zeroes alike as "not yet claimed".
      :local claimed [/ip hotspot user get $id mac-address]
      :if (([:typeof $claimed] = "nothing") or ($claimed = "") or \
           ($claimed = "00:00:00:00:00:00")) do={
        /ip hotspot user set $id mac-address=$rfuMac
        :log info ("resident " . $rfuUser . " locked to device " . $rfuMac)
      }
    }
  }
}

/ip hotspot user profile
set [find name="RESIDENT"] \
  on-login=":global rfuUser \$user; :global rfuMac \$\"mac-address\"; /system script run resident-first-use"


# =============================================================================
#  RUNNING IT DAY TO DAY
#
#  Add a resident. Pick any name and code you like -- a name is easier to
#  remember at the till than a number, and these are people you know.
#
#    /ip hotspot user add name="kwame" password="kwame2026" profile=RESIDENT
#    /ip hotspot user add name="ama"   password="ama4471"   profile=RESIDENT
#
#  See everyone and whether they are locked to a device:
#
#    /ip hotspot user print detail where profile="RESIDENT"
#
#  Who is online right now:
#
#    /ip hotspot active print
#
#  STOPPED PAYING -- switch them off. Their code stops working immediately and
#  their current session is cut. Nothing is deleted, so you can switch them
#  back on later without re-issuing anything.
#
#    /ip hotspot user set [find name="kwame"] disabled=yes
#    /ip hotspot active remove [find user="kwame"]
#
#  PAID AGAIN -- switch them back on:
#
#    /ip hotspot user set [find name="kwame"] disabled=no
#
#  NEW PHONE -- clear the device lock so it binds to the new one.
#  All-zeroes is how MikroTik expresses "any device": the property will not
#  take an empty value, and !mac-address is not accepted here.
#
#    /ip hotspot user set [find name="kwame"] mac-address=00:00:00:00:00:00
#
#  GONE FOR GOOD -- remove the account entirely:
#
#    /ip hotspot user remove [find name="kwame"]
#
#
#  A NOTE ON BILLING THEM
#
#  Monthly suits this better than yearly. You collect twelve times instead of
#  once, a non-payer costs you one month rather than a year, and switching an
#  account off is the same one command either way. The router does not track
#  who has paid -- that is your record to keep. Set a reminder for collection
#  day; the router will happily serve someone who stopped paying in March.
#
#
#  PHONES RANDOMISE THEIR WIFI MAC
#
#  Some phones rotate their WiFi address periodically. When that happens to a
#  resident, their own code locks them out. The fix is the "new phone" command
#  above. If it keeps happening to the same person, have them turn off "Private
#  WiFi Address" / "Randomised MAC" for your network in their WiFi settings.
# =============================================================================
