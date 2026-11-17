(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let products=[],editing=null;
async function api(path,method='GET',body){const response=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});let data;try{data=await response.json()}catch{throw Error('Erro de conexão com o servidor')}if(!response.ok)throw Error(data.error||'Falha na solicitação');return data}
function show(message,error=false){$('message').innerHTML=`<div class="${error?'error':'success'}" style="background:white;border-radius:10px;padding:12px 16px">${esc(message)}</div>`;window.scrollTo({top:0,behavior:'smooth'})}
function view(name){for(const id of ['setupSection','loginSection','dashboard'])$(id).classList.toggle('hidden',id!==name);$('logout').classList.toggle('hidden',name!=='dashboard')}
async function start(){try{const status=await api('status');view(!status.initialized?'setupSection':status.loggedIn?'dashboard':'loginSection');if(status.loggedIn)await loadProducts()}catch(err){show(err.message,true)}}
async function loadProducts(){try{products=(await api('products?admin=1')).products;renderList()}catch(err){show(err.message,true);if(/login/i.test(err.message))view('loginSection')}}
function renderList(){ $('productTotal').textContent=`${products.length} cadastrado(s)`;$('productList').innerHTML=products.map(p=>`<div class="item"><img src="${esc(p.image_url)}" alt=""><div class="itemmain"><strong>${esc(p.name)}</strong><small>${esc(p.category)} · ${money(p.price)} · ${p.active?'Publicado':'Oculto'}${p.featured?' · Destaque':''}</small></div><div class="itembuttons"><button class="tiny" data-share="${p.id}">🔗 Gerar página</button><button class="tiny" data-edit="${p.id}">Editar</button><button class="tiny danger" data-delete="${p.id}">Excluir</button></div></div>`).join('')||'<div class="empty">Nenhum produto cadastrado. Adicione o primeiro abaixo.</div>';
 $('productList').querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>share(Number(b.dataset.share)));
 $('productList').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(Number(b.dataset.edit)));
 $('productList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>remove(Number(b.dataset.delete)));
}
function reset(){editing=null;$('productForm').reset();$('active').checked=true;$('formTitle').textContent='Adicionar produto';$('saveButton').textContent='Salvar produto'}
function edit(id){const p=products.find(x=>x.id===id);if(!p)return;editing=id;for(const k of ['name','category','badge','price','old_price','image_url','affiliate_url','description'])$(k).value=p[k]??'';$('featured').checked=!!p.featured;$('active').checked=!!p.active;$('formTitle').textContent='Editando: '+p.name;$('saveButton').textContent='Salvar alterações';$('editor').scrollIntoView({behavior:'smooth'})}
async function remove(id){const p=products.find(x=>x.id===id);if(!p||!confirm(`Excluir definitivamente "${p.name}"?\n\nO link da página individual deixará de funcionar.`))return;try{await api('products/'+id,'DELETE',{});show('Produto excluído');if(editing===id)reset();await loadProducts()}catch(err){show(err.message,true)}}
async function share(id){const p=products.find(x=>x.id===id);if(!p)return;if(!p.active)return show('Publique o produto antes de compartilhar a página.',true);const link=location.origin+'/produto/'+encodeURIComponent(p.slug);try{await navigator.clipboard.writeText(link);show('Página individual gerada. Link copiado: '+link)}catch{prompt('Copie a página do produto:',link)}}
$('setupForm').onsubmit=async e=>{e.preventDefault();try{await api('setup','POST',{key:$('setupKey').value,password:$('setupPassword').value});$('setupForm').reset();view('loginSection');show('Administrador criado. Faça login usando a senha definida.')}catch(err){show(err.message,true)}};
$('loginForm').onsubmit=async e=>{e.preventDefault();try{await api('login','POST',{password:$('loginPassword').value});$('loginForm').reset();view('dashboard');await loadProducts();show('Bem-vindo ao painel!')}catch(err){show(err.message,true)}};
$('logout').onclick=async()=>{try{await api('logout','POST',{});view('loginSection');show('Você saiu do painel.')}catch(err){show(err.message,true)}};
$('productForm').onsubmit=async e=>{e.preventDefault();const body={name:$('name').value,category:$('category').value,badge:$('badge').value,price:Number($('price').value),old_price:$('old_price').value===''?null:Number($('old_price').value),image_url:$('image_url').value,affiliate_url:$('affiliate_url').value,description:$('description').value,featured:$('featured').checked,active:$('active').checked};try{await api(editing?'products/'+editing:'products',editing?'PUT':'POST',body);reset();await loadProducts();show('Produto salvo e sincronizado com a vitrine.')}catch(err){show(err.message,true)}};
$('newProduct').onclick=()=>{reset();$('editor').scrollIntoView({behavior:'smooth'})};$('cancelEdit').onclick=reset;
$('passwordForm').onsubmit=async e=>{e.preventDefault();try{await api('change-password','POST',{oldPassword:$('oldPassword').value,newPassword:$('newPassword').value});$('passwordForm').reset();view('loginSection');show('Senha alterada. Entre novamente.')}catch(err){show(err.message,true)}};
start();
})();
