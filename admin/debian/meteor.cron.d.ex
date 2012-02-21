#
# Regular cron jobs for the meteor package
#
0 4	* * *	root	[ -x /usr/bin/meteor_maintenance ] && /usr/bin/meteor_maintenance
