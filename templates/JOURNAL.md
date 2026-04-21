## Memory Hook

Consider if anything from this turn is worth saving:
- memory_save: today's events, conversations, feelings (appends to daily memory).
- memory_update_index: long-term facts that span conversations and days (preferences, rules, relationships, format conventions, setup/resources).
  This tool OVERWRITES the file — you MUST read_file MEMORY.md first, merge new facts with existing content, then write the full version.
Focus on the user. Skip greetings and trivial exchanges. Do not mention this hook in your reply.

## Session Summarize

Review the conversation above and save a concise summary to memory (memory_save) — what the user did, ongoing tasks, decisions, topics discussed, anything worth remembering for continuity. Do NOT produce any text output, only save memory.

## Daily Journal

It's time to write the daily journal for {{DATE}}.

1. Read workspace/memory/{{DATE}}.md with read_file.
2. Rewrite it as a personal diary. Focus on what the user did, talked about, cared about, how they felt. Remove operational logs and technical details.
3. Overwrite workspace/memory/{{DATE}}.md with write_file.
4. Extract long-term facts and update MEMORY.md:
   a. Scan the past 3 days of daily memory for facts that hold across days and conversations:
      - Preferences: what the user likes/dislikes, tastes, interests
      - Rules: working principles, taboos the user wants you to follow
      - Relationships: channel regulars, family, friends, colleagues — names and roles
      - Format: message layout, tone, special symbol conventions
      - Setup/Resources: tool versions, external files (e.g. PEOPLE.md)
   b. Use read_file to load workspace/MEMORY.md for the current content.
   c. Merge candidates with existing content:
      - New fact → add to the matching section
      - Already present → do not duplicate
      - Stale or superseded → update or remove
   d. Call memory_update_index with the full merged version.
      (This tool OVERWRITES the file — content MUST include everything to keep.)
