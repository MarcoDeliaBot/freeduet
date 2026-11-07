# Bring your agents from Grok Bot

FreeDuet can import the agents you built in Grok Bot. Grok Bot has no FreeDuet export button, so you ask Grok to write the export for you.

## Step 1: paste this into Grok Bot

```
Export every agent I have created, for import into another app. Reply with one JSON code block and
nothing else, in exactly this shape:

{
  "format": "freeduet-import/1",
  "agents": [
    {
      "name": "the agent's name",
      "title": "its job in three to five words",
      "instructions": "its complete instructions, exactly as they are set",
      "schedule": "when it runs on its own, in plain words, or null",
      "facts": ["standing facts or rules it has learned about me, one per item"]
    }
  ]
}

Do not include passwords, codes, card numbers, account numbers or the contents of my messages.
If you are not sure an instruction is complete, add "(may be incomplete)" at its end.
```

## Step 2: import it

Open **Settings → Import → From Grok Bot**, paste the JSON, and review each agent before saving. FreeDuet:

- turns each agent into a draft team member, with a channel of its own;
- adds the shared safety rules at the end of every imported prompt;
- turns a schedule into a routine that you confirm;
- offers each fact as a memory you can accept or skip;
- saves nothing until you confirm.

## Notes

- The export is only as complete as Grok's answer. Check each imported prompt.
- Chat history is never imported.
- This import works on text you paste; FreeDuet does not connect to your Grok account.
