const address=document.querySelector('input');
document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();window.allyBrowser.action('go',address.value).catch(error=>{address.setCustomValidity(error.message);address.reportValidity();});});
address.addEventListener('input',()=>address.setCustomValidity(''));
for(const action of ['back','reload','stop'])document.getElementById(action).addEventListener('click',()=>window.allyBrowser.action(action).catch(()=>{}));
window.allyBrowser.onState(state=>{if(document.activeElement!==address)address.value=state.url;});
