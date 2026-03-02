https://github.com/Chen-zexi/open-ptc-agent


# Open PTC — Prode)

## What this is

Instead of the current round-trip-per-tool loop:
```
LLM → {"name": "tool_a"} → result → LLM → {"name": "tool_b"} → result → LLM → final answer
```

PTC has the LLM write a script that calls all tools it needs:
`
LLM → script { tool_a(); tool_b(); print(summary) } → execute → final output → LLM → answer
```

fits:
- N tools = 2 LLM calls (one to writeN+1
t window
- LLM can filter/aggregate data before it reaches context
- Loops, coree

## Architecture

```
PiP

        ├── [existing] runAgenticLoop   ← JSON round-trip mode (kept as fallback)
 mode
              └r
ipt
   
         
     ut
```

## Sandbox

Client-side Jire`.
Tool calls ar

For future: Daytona sandbox for Pythpable).

## Script format the LLM writes

```javascript
// Tool calls use await
const
const
print(content.slice(0
```

`prLLM.

## Files

- `glass-pip-chat/src/services/ptcExecutor.ts` — sandbox + script runner
- `glass-pip-ion


## Mode selection

- PTC mode: enabled when `ptcMode` toggle is on (new toggle in footer next to agentic)
- Falls back to `runAgenticLoop` if LLM doesn't produce a valid script
ble
