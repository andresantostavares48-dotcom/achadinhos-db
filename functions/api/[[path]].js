const COOKIE = 'achadinhos_session';
const SESSION_SECONDS = 60 * 60 * 8;
const CATEGORIES = ['Tecnologia','Casa','Beleza','Moda','Emagrecimento','Fitness','Outros'];
const encoder = new TextEncoder();
const send = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...headers}});
const fail = (message,status=400)=>send({error:message},status);
const hex = bytes => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const hash = async value => hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const random = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));
const passwordHash = async (password,salt,iterations) => hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations},await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']),256));
const tokenCookie = (value,maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const parseCookie = (cookie='') => cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1)||'';
const slugify = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'produto';
const publicColumns = 'id,slug,name,category,description,price,old_price,image_url,affiliate_url,badge,featured,created_at';
const isValidUrl = input => {try{const url=new URL(input);return ['https:','http:'].includes(url.protocol)&&url.hostname.length>2&&!url.username&&!url.password;}catch{return false;}};
async function currentAdmin(request,db){
 const token=parseCookie(request.headers.get('Cookie'));
 if(!/^[0-9a-f]{64}$/.test(token))return false;
 const rec=await db.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token),Math.floor(Date.now()/1000)).first();
 return !!rec;
}
async function issueSession(db){const token=random(32);const expires=Math.floor(Date.now()/1000)+SESSION_SECONDS;await db.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES (?,?)').bind(await hash(token),expires).run();return token;}
function validateProduct(p){
 if(!p||typeof p!=='object')return 'Dados inválidos';
 for(const k of ['name','description','image_url','affiliate_url'])if(typeof p[k]!=='string')return `Campo ${k} inválido`;
 if(p.name.trim().length<3||p.name.length>120)return 'Nome: 3 a 120 caracteres';
 if(p.description.trim().length<10||p.description.length>4000)return 'Descrição: 10 a 4000 caracteres';
 if(!CATEGORIES.includes(p.category))return 'Categoria inválida';
 if(!Number.isFinite(Number(p.price))||Number(p.price)<=0||Number(p.price)>10000000)return 'Preço inválido';
 if(p.old_price!==null&&p.old_price!==undefined&&p.old_price!==''&&(!Number.isFinite(Number(p.old_price))||Number(p.old_price)<0))return 'Preço antigo inválido';
 if(p.image_url.length>2000||!isValidUrl(p.image_url)||p.affiliate_url.length>3000||!isValidUrl(p.affiliate_url))return 'Use URLs http(s) válidas para imagem e afiliado';
 if(p.badge!==undefined&&(typeof p.badge!=='string'||p.badge.length>40))return 'Selo inválido';
 return null;
}
function normalized(p){return {name:p.name.trim(),category:p.category,description:p.description.trim(),price:Number(p.price),old_price:p.old_price===''||p.old_price==null?null:Number(p.old_price),image_url:p.image_url.trim(),affiliate_url:p.affiliate_url.trim(),badge:(p.badge||'').trim(),featured:p.featured?1:0,active:p.active===false||p.active===0?0:1};}
async function newSlug(db,name,ignoreId=null){const base=slugify(name);let slug=base;for(let n=2;n<500;n++){const exists=await db.prepare('SELECT id FROM products WHERE slug=?').bind(slug).first();if(!exists||exists.id===ignoreId)return slug;slug=`${base}-${n}`;}throw Error('Não foi possível gerar endereço único');}
async function readBody(request){if(Number(request.headers.get('content-length')||0)>20000)throw Error('Conteúdo muito grande');return await request.json();}
export async function onRequest({request,env,params}){
 if(!env.DB)return fail('Banco D1 não vinculado (DB)',503);
 const db=env.DB;
 const url=new URL(request.url);
 const path=(Array.isArray(params.path)?params.path.join('/'):params.path||'').replace(/^\/+|\/+$/g,'');
 const method=request.method;
 try {
  if(!['GET','HEAD','OPTIONS'].includes(method)){
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return fail('Origem não permitida',403);
   if(!(request.headers.get('Content-Type')||'').includes('application/json'))return fail('Envie JSON',415);
  }
  if(path==='products'&&method==='GET'){
   const all=url.searchParams.get('admin')==='1';
   if(all&&!await currentAdmin(request,db))return fail('Faça login',401);
   const rows=await db.prepare(`SELECT ${publicColumns}${all?',active,updated_at':''} FROM products ${all?'':'WHERE active=1'} ORDER BY featured DESC, id DESC LIMIT 500`).all();
   return send({products:rows.results});
  }
  if(path.startsWith('product/')&&method==='GET'){
   const slug=decodeURIComponent(path.slice(8));
   const product=await db.prepare(`SELECT ${publicColumns} FROM products WHERE slug=? AND active=1`).bind(slug).first();
   return product?send({product}):fail('Produto não encontrado',404);
  }
  if(path==='status'&&method==='GET'){
   const admin=await db.prepare('SELECT id FROM admins WHERE id=1').first();
   return send({initialized:!!admin,loggedIn:await currentAdmin(request,db)});
  }
  if(path==='setup'&&method==='POST'){
   if(!env.SETUP_KEY||env.SETUP_KEY.length<16)return fail('Configure SETUP_KEY com pelo menos 16 caracteres no Cloudflare',503);
   const existing=await db.prepare('SELECT id FROM admins WHERE id=1').first();if(existing)return fail('Administrador já configurado',409);
   const p=await readBody(request);
   if(typeof p.key!=='string'||p.key!==env.SETUP_KEY)return fail('Chave de instalação incorreta',403);
   if(typeof p.password!=='string'||p.password.length<12||p.password.length>128)return fail('Senha deve ter entre 12 e 128 caracteres');
   const salt=random(16),iterations=210000,pass=await passwordHash(p.password,salt,iterations);
   try{await db.prepare('INSERT INTO admins(id,username,salt,password_hash,iterations) VALUES (1,?,?,?,?)').bind('admin',salt,pass,iterations).run();}catch{return fail('Administrador já configurado',409);}
   return send({ok:true});
  }
  if(path==='login'&&method==='POST'){
   const p=await readBody(request);
   if(typeof p.password!=='string'||p.password.length>128)return fail('Credenciais inválidas',401);
   const admin=await db.prepare('SELECT * FROM admins WHERE id=1').first();if(!admin)return fail('Configure o administrador primeiro',409);
   const provided=await passwordHash(p.password,admin.salt,admin.iterations);
   if(provided!==admin.password_hash)return fail('Senha incorreta',401);
   await db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Math.floor(Date.now()/1000)).run();
   return send({ok:true},200,{'Set-Cookie':tokenCookie(await issueSession(db),SESSION_SECONDS)});
  }
  if(path==='logout'&&method==='POST'){
   const token=parseCookie(request.headers.get('Cookie'));
   if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
   return send({ok:true},200,{'Set-Cookie':tokenCookie('',0)});
  }
  if(path==='change-password'&&method==='POST'){
   if(!await currentAdmin(request,db))return fail('Faça login',401);
   const p=await readBody(request),admin=await db.prepare('SELECT * FROM admins WHERE id=1').first();
   if(typeof p.oldPassword!=='string'||typeof p.newPassword!=='string')return fail('Informe as senhas');
   if(await passwordHash(p.oldPassword,admin.salt,admin.iterations)!==admin.password_hash)return fail('Senha atual incorreta',403);
   if(p.newPassword.length<12||p.newPassword.length>128)return fail('Nova senha: 12 a 128 caracteres');
   const salt=random(16),iterations=210000,pass=await passwordHash(p.newPassword,salt,iterations);
   await db.prepare('UPDATE admins SET salt=?,password_hash=?,iterations=? WHERE id=1').bind(salt,pass,iterations).run();
   await db.prepare('DELETE FROM sessions').run();
   return send({ok:true},200,{'Set-Cookie':tokenCookie('',0)});
  }
  if(path==='products'&&method==='POST'){
   if(!await currentAdmin(request,db))return fail('Faça login',401);
   const p=await readBody(request),error=validateProduct(p);if(error)return fail(error);
   const v=normalized(p),slug=await newSlug(db,v.name);
   const row=await db.prepare('INSERT INTO products(slug,name,category,description,price,old_price,image_url,affiliate_url,badge,featured,active) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id,slug').bind(slug,v.name,v.category,v.description,v.price,v.old_price,v.image_url,v.affiliate_url,v.badge,v.featured,v.active).first();
   return send({ok:true,product:row},201);
  }
  const m=path.match(/^products\/(\d+)$/);
  if(m&&['PUT','DELETE'].includes(method)){
   if(!await currentAdmin(request,db))return fail('Faça login',401);
   const id=Number(m[1]);const existing=await db.prepare('SELECT id,slug FROM products WHERE id=?').bind(id).first();if(!existing)return fail('Produto não encontrado',404);
   if(method==='DELETE'){await db.prepare('DELETE FROM products WHERE id=?').bind(id).run();return send({ok:true});}
   const p=await readBody(request),error=validateProduct(p);if(error)return fail(error);
   const v=normalized(p);
   await db.prepare('UPDATE products SET name=?,category=?,description=?,price=?,old_price=?,image_url=?,affiliate_url=?,badge=?,featured=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(v.name,v.category,v.description,v.price,v.old_price,v.image_url,v.affiliate_url,v.badge,v.featured,v.active,id).run();
   return send({ok:true,slug:existing.slug});
  }
  return fail('Rota não encontrada',404);
 }catch(err){console.error('API error',err);return fail(err instanceof SyntaxError?'JSON inválido':'Erro ao processar solicitação',500);}
}
