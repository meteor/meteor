Each client creates a room when it starts up and joins that room plus
`roomsPerClient` other rooms.

Every `talkativePeriodSeconds`, each client has a
`chanceClientIsTalkative` probability of being "talkative". If it is
talkative for that period, it will send one `messageSize` sized message
every `talkativeMessagesPerSecond` for the duration of the period.

Old messages are deleted every `messageHistorySeconds` seconds. Old
rooms are deleted every `roomHistorySeconds`. `roomHistorySeconds`
should line up with the length a particular client dwells on the site
(typically part of the phantomjs script used to drive the clients.)
