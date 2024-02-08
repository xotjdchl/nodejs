const router = require('express').Router()

let connectDB = require('./../database.js')


let db;
connectDB.then((client) => {
    // console.log('DB 연결 성공')
    db = client.db('forum');
}).catch((err) => {
    console.log(err)
})

router.get('/shirts', async (req, res) => {
    await db.collection('post').find().toArray()
    res.send('셔츠 파는 페이지임')
})

router.get('/pants', (req, res) => {
    res.send('바지 파는 페이지임')
})

module.exports = router // 이 파일을 모듈로 만들어서 내보내겠다는 의미