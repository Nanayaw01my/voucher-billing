# =============================================================================
#  EUNISET LOVE — one device, and a clock that starts on first login
#
#  On a voucher's FIRST successful login this does two things:
#
#    1. Locks the voucher to that device. No other phone can use the code.
#    2. Starts a countdown equal to the time the customer bought, and disables
#       the voucher when it runs out -- whether they stayed connected or not.
#
#  So a 24-hour voucher bought at 9am stops working at 9am tomorrow, even if
#  the customer was only online for twenty minutes. That is what a customer
#  expects of "24 hours", and it stops a code being stretched over weeks.
#
#  The countdown length is taken from each voucher's own limit-uptime, which
#  the dashboard sets from the package. So 1 Hour gets an hour, 24 Hours gets
#  a day, with no list to maintain here. Data-only vouchers (1GB, 2GB, 5GB)
#  have no time limit, so they get the fallback window below.
#
#  Install:  upload, then  /import file-name=voucher-first-use.rsc
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
      :if ([/ip hotspot user get $id mac-address] = "") do={
        /ip hotspot user set $id mac-address=$vfuMac
        :log info ("voucher " . $vfuUser . " locked to device " . $vfuMac)
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

# Hand the login details to that script. Kept to one line so there is only one
# level of quoting to get wrong.
/ip hotspot profile
set [find name=eunisetlove-profile] on-login=":global vfuUser \$user; :global vfuMac \$\"mac-address\"; /system script run voucher-first-use"


# =============================================================================
#  CHECKING IT
#
#  After a customer logs in for the first time:
#    /log print where message~"voucher"
#    /ip hotspot user print detail where name="THEIRCODE"     (mac-address set)
#    /system scheduler print where name~"expire-"             (their countdown)
#
#  How long a voucher has left:
#    /system scheduler print detail where name="expire-THEIRCODE"
#
#  MANAGING IT
#
#  Give a customer their voucher back (clears the lock and the countdown):
#    /ip hotspot user set [find name="THEIRCODE"] mac-address="" disabled=no
#    /system scheduler remove [find name="expire-THEIRCODE"]
#
#  Turn the whole thing off:
#    /ip hotspot profile set [find name=eunisetlove-profile] on-login=""
#  Then clear what it left behind, if you want to:
#    /system scheduler remove [find comment="EUNISET LOVE voucher expiry"]
#    /ip hotspot user set [find where mac-address!=""] mac-address=""
#
#  TWO THINGS TO KNOW
#
#  A reboot restarts each countdown from the beginning, so a power cut extends
#  every voucher that is mid-life. Starlink sites lose power often enough that
#  this will happen; it costs you a little and inconveniences nobody, which is
#  the right way round for a bug of this kind.
#
#  Phones randomise their WiFi MAC. If a customer's address rotates mid-voucher
#  the lock shuts them out of time they paid for, and the fix is to clear their
#  lock by hand with the command above. Keep it to hand at the till.
# =============================================================================
