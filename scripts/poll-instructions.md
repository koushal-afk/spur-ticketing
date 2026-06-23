# Spur Poller — Claude Scheduled Task Instructions

This file describes what the Claude scheduled task does every 5 minutes.

## Task prompt (used by the scheduled task):

Poll Spur for new and updated WhatsApp conversations and send them to the ticketing system.

Steps:
1. Use the Spur MCP tool `conversation_search` with `channelType: "whatsapp"` and `limit: 50` to get recent conversations.
2. For each conversation, use `conversation_messages` with `limit: 10` to get the latest messages.
3. POST the data to http://localhost:3000/api/poll with:
   - Header: `x-poll-secret: spur_poll_secret_2024`
   - Header: `Content-Type: application/json`
   - Body: `{ "conversations": [...], "messagesMap": { "<conversationId>": [...messages] } }`
4. Log the response (how many tickets were created/updated).

Use the Bash tool to make the POST request with curl.
