/** On-demand reference for tap-to-ask follow-ups and sound accents (bundled engine 1.6 button() and sfx()). */
export const NATIVE_STUDY_FOLLOWUP_INSTRUCTION = `End a teaching answer with 2–3 short tap-to-ask follow-ups in calm space, e.g. button(x,y,"Why 2π?",{ask:"Why is the period 2π?"}). sfx('ding'|'nope'|'tada'|'sparkle') before a key mark: at most one per answer.`;

export const NATIVE_STUDY_FOLLOWUPS_REFERENCE = {
  api: `Follow-ups: button(x,y,text,{ask:words}) draws a real pressable pill top-left at x,y (canvas pixels), or button(box,text,{ask}) centred on a paper/photo box's bottom edge. Pressing it sends words as the user's next message in this same chat. After a teaching answer add 2–3 in the last step, under the drawing or along the bottom, each label ≤4 words and ask a complete question the lesson set up (deeper why, worked example, check-my-understanding). Skip them for quick acknowledgements, quiz follow-ups and actions. Pills move clear of existing ink. nextQuestions() is the welcome-tour only and is ignored in Study.
Sound: sfx(name) plays an accent as the NEXT mark lands: 'ding' right answer, 'nope' wrong option/trap, 'stamp' verdict or big number, 'tada' finished picture, 'sparkle' insight, 'whoosh' jump in time, 'boing' playful. Other names are silent. At most one per answer, never in conversation-only replies. Marks already make quiet drawing sounds; all of it respects the user's drawing-sound setting, so never mention or depend on hearing it.`,
  example: `step(1); say("A sine wave repeats every two pi radians.");
const wave=graph(140,160,700,300,{x:[0,12.6],y:[-1.5,1.5]});
wave.plot(t=>sin(t),{tone:"blue"});
step(2); say("That repeat length is the period."); sfx("sparkle");
arrow([[140,500],[520,500]],{tone:"orange"}); text(330,540,"one period = 2π",{size:22,anchor:"middle"});
button(140,600,"Why 2π?",{ask:"Why is the period of sin exactly 2π?"});
button(330,600,"Change frequency",{ask:"Show what happens to the period when I use sin(2t)."});
button(560,600,"Quiz me",{ask:"Give me one quick question to check I understand the period."});`,
} as const;
