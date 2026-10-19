#!/bin/bash
# SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Fill the dev server with a list shaped like Paul's real ones, so UI work is
# judged against realistic tasks rather than an empty page:
#
#   dev/seed.sh [port]        default 8091
#
# Covers: reminder-only tasks (Paul's tasks carry a VALARM and no DUE, which is
# how Apple Reminders writes them), overdue and upcoming due dates, all-day and
# timed, starred and medium priority, a note, tags, a long name, subtasks and a
# completed task. Dates are relative to today, so it stays meaningful. Re-running
# it overwrites the same tasks.
set -euo pipefail
PORT="${1:-8091}"
BASE="http://localhost:$PORT/remote.php/dav/calendars/admin"
CAL="$BASE/immediate-tasks"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

curl -s -u admin:admin -X MKCALENDAR "$CAL/" -H 'Content-Type: application/xml' --data \
'<?xml version="1.0"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
 <d:set><d:prop>
  <d:displayname>Immediate Tasks</d:displayname>
  <a:calendar-color>#FF6F61</a:calendar-color>
  <c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
 </d:prop></d:set>
</c:mkcalendar>' -o /dev/null -w "list: %{http_code} (201 created, 405 already there)\n"

# Dates relative to today. day N -> YYYYMMDD; utc N HH -> YYYYMMDDTHH0000Z
day() { date -v"${1}d" +%Y%m%d; }
utc() { date -u -v"${1}d" -v"${2}H" -v0M -v0S +%Y%m%dT%H%M%SZ; }
alarm() { printf 'BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:Reminder\nTRIGGER;VALUE=DATE-TIME:%s\nEND:VALARM\n' "$1"; }

put() {
	local uid="$1" body="$2"
	{
		printf 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//tasks-fork//seed//EN\nBEGIN:VTODO\n'
		printf 'UID:%s\nDTSTAMP:%s\nCREATED:%s\n' "$uid" "$(utc +0 12)" "$(utc -7 12)"
		printf '%s\n' "$body"
		printf 'END:VTODO\nEND:VCALENDAR\n'
	} | sed 's/$/\r/' | grep -v '^\r$' > "$TMP"
	curl -s -u admin:admin -X PUT "$CAL/$uid.ics" -H 'Content-Type: text/calendar' \
		--data-binary @"$TMP" -o /dev/null -w "$uid: %{http_code}\n"
}

put agents   "SUMMARY:Explore the idea of specialized agents that focus on particular tech stacks"
put jev      "SUMMARY:Look into Jev for automation
DESCRIPTION:This is a todo reminder.
$(alarm "$(utc -7 16)")"
put gex      "SUMMARY:Remind me to look at the GEX Project
DESCRIPTION:After the clean week, run the cleanup.
$(alarm "$(utc +4 16)")"
put cards    "SUMMARY:Order business cards
DUE;VALUE=DATE:$(day -6)
PRIORITY:1"
put today    "SUMMARY:Call the bank about the wire
DUE:$(utc +0 23)"
put tomorrow "SUMMARY:Send Bill the federated attachments build notes
DUE;VALUE=DATE:$(day +1)
CATEGORIES:Talk,Bill"
put soon     "SUMMARY:Renew the Apple developer certificate
DUE;VALUE=DATE:$(day +4)"
put later    "SUMMARY:Plan the Nextcloud 36 upgrade
DUE;VALUE=DATE:$(day +46)"
put nextyear "SUMMARY:File the taxes
DUE;VALUE=DATE:$(day +178)
PRIORITY:5"
put parent   "SUMMARY:Set up the Tasks fork
DUE;VALUE=DATE:$(day +2)"
put child1   "SUMMARY:Restyle the task list
RELATED-TO:parent"
put child2   "SUMMARY:Design subtasks
RELATED-TO:parent
DUE;VALUE=DATE:$(day +11)"
put done1    "SUMMARY:Fork nextcloud/tasks
STATUS:COMPLETED
COMPLETED:$(utc +0 16)
PERCENT-COMPLETE:100"
