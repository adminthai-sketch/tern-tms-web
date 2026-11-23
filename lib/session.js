const crypto = require('crypto');
const pool = require('../config/db');
const cookieName = 'tms_session';
function secret() {
    const value = process.env.TMS_SESSION_SECRET || process.env.DATABASE_URL;
    if (!value) throw new Error('Session configuration is missing');
    return value;
}
function sign(text) { return crypto.createHmac('sha256',secret()).update(text).digest('base64url'); }
function fingerprint(hash) { return crypto.createHash('sha256').update(hash).digest('hex').slice(0,24); }
function setSessionCookie(req,res,user,passwordHash) {
    const payload=Buffer.from(JSON.stringify({id:user.id,expires:Date.now()+8*3600000,stamp:fingerprint(passwordHash)})).toString('base64url');
    const secure=req.secure || req.headers['x-forwarded-proto']==='https';
    res.setHeader('Set-Cookie',`${cookieName}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${secure?'; Secure':''}`);
}
function readSession(req) {
    const cookie=String(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='));
    if (!cookie) return null;
    try {
        const [payload,signature]=cookie.slice(cookieName.length+1).split('.');
        const actual=Buffer.from(signature||'');const expected=Buffer.from(sign(payload));
        if(actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) return null;
        const value=JSON.parse(Buffer.from(payload,'base64url').toString());
        return Number.isSafeInteger(Number(value.id)) && value.expires>Date.now()?value:null;
    } catch { return null; }
}
function requirePermission(permission) {
    return async (req,res,next)=>{
        const session=readSession(req);
        if(!session) return res.status(401).json({success:false,message:'กรุณาเข้าสู่ระบบอีกครั้งเพื่อยืนยันสิทธิ์'});
        try {
            const result=await pool.query(`SELECT u.id,u.status,u.password_hash,r.role_name,r.permissions FROM users u
                LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,[session.id]);
            const user=result.rows[0];
            if(!user || user.status!=='ACTIVE' || fingerprint(user.password_hash)!==session.stamp)
                return res.status(401).json({success:false,message:'กรุณาเข้าสู่ระบบใหม่'});
            const admin=String(user.role_name).toUpperCase()==='ADMIN' || user.permissions?.admin===true;
            if(!admin && user.permissions?.[permission]!==true) return res.status(403).json({success:false,message:'ไม่มีสิทธิ์ใช้งานส่วนนี้'});
            req.sessionUser={id:user.id};next();
        } catch { res.status(503).json({success:false,message:'ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่'}); }
    };
}
module.exports={setSessionCookie,readSession,requirePermission};
