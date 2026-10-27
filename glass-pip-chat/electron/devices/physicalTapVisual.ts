/** Inert receipt animation only. No scripts/assets/attachments or message-delivery claim. */
export const physicalTapArrivalHtml = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
*{box-sizing:border-box}body{margin:0;overflow:hidden;color:#e8fff8;font:15px system-ui;background:transparent}
.stage{height:300px;position:relative;display:flex;align-items:flex-end;justify-content:center;padding-bottom:18px}
.card{position:relative;width:340px;padding:19px 22px 19px 86px;border-radius:30px;background:linear-gradient(135deg,#152d2bf5,#101f23f5);border:1px solid #9effdf3b;box-shadow:0 14px 35px #0004;animation:card-in .6s cubic-bezier(.16,1,.3,1) both,leave .4s 2.6s both}
.label{font-weight:600}.sub{display:block;font-size:12px;color:#acd4c7;margin-top:5px}
.halo{position:absolute;left:50%;top:60%;width:150px;height:150px;border:2px solid #a4ffe8;border-radius:50%;box-shadow:0 0 30px #8affd16b,inset 0 0 35px #74dfca35;animation:land 1.15s cubic-bezier(.2,.7,.25,1) both}
.halo.two{animation-delay:.12s;border-color:#77c9ff85}.halo.three{animation-delay:.24s;border-color:#9bffe56b}
.orb{position:absolute;left:25px;top:21px;width:40px;height:40px;border-radius:50%;background:radial-gradient(circle at 35% 25%,#eafffb,#87efd1 30%,#32665f 70%);box-shadow:0 0 22px #80ffd777;animation:orb 1s .4s both}
@keyframes land{0%{transform:translate(-50%,80px) scale(.12);opacity:0}25%{opacity:1}65%{transform:translate(-50%,-55px) scale(1);opacity:.85}100%{transform:translate(-50%,-75px) scale(1.65);opacity:0}}
@keyframes card-in{from{transform:translateY(100px) scale(.93);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
@keyframes orb{from{transform:scale(.2);opacity:0}70%{transform:scale(1.15);opacity:1}to{transform:scale(1);opacity:1}}
@keyframes leave{to{transform:translateY(30px);opacity:0}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.halo{display:none}}
</style><div class="stage"><div class="halo"></div><div class="halo two"></div><div class="halo three"></div><div class="card"><span class="orb"></span><span class="label">Phone screen ready to review</span><span class="sub">Choose a chat and Send on your phone</span></div></div>`;
