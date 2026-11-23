const express = require('express');
const router = express.Router();
router.post('/logout',(req,res)=>{
    res.setHeader('Set-Cookie','tms_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');
    res.json({success:true});
});

// ใส่ Route เพิ่มเติมได้ที่นี่ในอนาคต

module.exports = router;
