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
# add-mac-cookie=yes is the one place this setup deliberately differs from the
# voucher profiles, which all use no. A cookie lets a phone log back in without
# retyping the code. On a voucher that is a hole -- it is how a code gets
# stretched across devices and days, which is why the voucher profiles refuse
# it. On a resident account there is nothing to protect: the account is
# permanently theirs by design. So the resident types their code once, and
# after that their phone connects silently. No login page every morning.
#
# How long a phone is remembered is set below, on the server profile.
#
# rate-limit is upload/download. These are faster than the voucher profiles
# because residents are paying monthly, not by the hour. Adjust to taste.

/ip hotspot user profile
remove [find name="RESIDENT"]
add name=RESIDENT shared-users=2 add-mac-cookie=yes rate-limit="4M/10M" \
    status-autorefresh=1m


# How long a remembered device stays remembered.
#
# This lives on the SERVER profile (/ip hotspot profile), not the user profile,
# so it is a single setting shared by everyone. That is safe here only because
# every VOUCHER-* profile sets add-mac-cookie=no and so never creates a cookie
# for this timeout to apply to. RESIDENT is the only profile that makes one.
#
# If you ever turn add-mac-cookie on for a voucher profile, this 30 days starts
# applying to those vouchers too, and a 24-hour code becomes a 30-day one.

/ip hotspot profile set [find] mac-cookie-timeout=30d


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
#  Add a resident.
#
#  The login page shows ONE field. Whatever the customer types is sent as both
#  the username and the password, and login.html upper-cases it on the way
#  (code.value.trim().toUpperCase()). So a resident account must have its name
#  and password IDENTICAL and in UPPERCASE, exactly like a voucher. The only
#  freedom you have is choosing something memorable instead of a random number.
#
#    /ip hotspot user add name="KWAME2026" password="KWAME2026" profile=RESIDENT
#    /ip hotspot user add name="AMA4471"   password="AMA4471"   profile=RESIDENT
#
#  name="kwame" with password="kwame2026" will always be rejected: the page
#  has no way to send two different values.
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
#    /ip hotspot user set [find name="KWAME2026"] disabled=yes
#    /ip hotspot active remove [find user="KWAME2026"]
#
#  PAID AGAIN -- switch them back on:
#
#    /ip hotspot user set [find name="KWAME2026"] disabled=no
#
#  THEY ARE BEING ASKED FOR THE CODE EVERY DAY
#
#  Their phone is not being remembered. Check the profile still has the cookie
#  turned on, and that the timeout survived a later edit:
#
#    /ip hotspot user profile print detail where name="RESIDENT"
#    /ip hotspot profile print detail
#
#  After switching an account off and on again the old cookie is gone, so they
#  type their code once more. That is expected, not a fault.
#
#
#  NEW PHONE -- clear the device lock so it binds to the new one.
#  All-zeroes is how MikroTik expresses "any device": the property will not
#  take an empty value, and !mac-address is not accepted here.
#
#    /ip hotspot user set [find name="KWAME2026"] mac-address=00:00:00:00:00:00
#
#  GONE FOR GOOD -- remove the account entirely:
#
#    /ip hotspot user remove [find name="KWAME2026"]
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
