const express = require('express')
const app = express()
const { MongoClient, ObjectId } = require('mongodb');
const methodOverride = require('method-override')
const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const bcrypt = require('bcrypt')
const MongoStore = require('connect-mongo')
require('dotenv').config()


// 페이지 로드 시 실행되는 함수

function logincheck(req, res, next) {
    if(req.user) {
        next()
    } else {
        res.send('<script>alert("로그인이 필요합니다");location.href="/login";</script>')
    }
}


function nav(req, res, next) {
    if(req.user) {
        res.locals.username = req.user.username
        res.locals.isLogin = true
    } else {
        res.locals.isLogin = false
    }
    next()
}

app.use(passport.initialize())
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave : false,
  saveUninitialized : false,
  cookie : { maxAge : 60 * 60 * 1000 },
  store : MongoStore.create({
        mongoUrl : process.env.DB_URL,
        dbName : 'forum',
    })
}))

app.use(passport.session()) 

//ejs
app.use(express.static(__dirname + '/public'))
app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(methodOverride('_method'))
app.use('/', nav)



let connectDB = require('./database.js')

let db;
connectDB.then((client) => {
    console.log('DB 연결 성공')
    db = client.db('forum');
    app.listen(process.env.PORT, () => {
        console.log('http://localhost:8080 에서 서버 실행중')
    })
}).catch((err) => {
    console.log(err)
})

const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const multer = require('multer')
const multerS3 = require('multer-s3')
const s3 = new S3Client({
  region : 'ap-northeast-2',
  credentials : {
      accessKeyId : process.env.S3_KEY,
      secretAccessKey : process.env.S3_SECRET,
  }
})

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.s3_BUCKET,
    key: function (요청, file, cb) {
      cb(null, Date.now().toString()) //업로드시 파일명 변경가능
    }
  })
})

const uploadProfile = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.s3_BUCKET,
        key: function (요청, file, cb) {
            cb(null, 'profile/' + Date.now().toString()) //업로드시 파일명 변경가능
        }
    })
})

const deleteFile = async (key) => {
    try {
        // console.log(key)
        const params = {
            Bucket : process.env.s3_BUCKET,
            Key : key
        }
        await s3.send(new DeleteObjectCommand(params))
    } catch (error) {
        console.log(error)
    }
}

app.get('/', nav, (req, res) => {
    res.redirect('/list')
})

app.get('/list', async (req, res) => {
    res.redirect('/list/1')
})



app.get('/time', (req, res) => {
    let now = new Date()
    res.render('time.ejs', { time: now })
})

app.get('/write', logincheck,(req, res) => {
    res.render('write.ejs', { user : req.user })
})

app.post('/newpost', logincheck, async (req, res) => {

    upload.single('img1')(req, res, async (err) => {
        if (err) {
            console.log(err)
            res.send(err.message)
        } else {
            try {
                if (req.body.title == '' || req.body.content == '') {
                    res.send('<script>alert("내용을 입력하세요");history.back();</script>')
                    return
                }
                else if (req.body.title.length > 30) {
                    res.send('<script>alert("제목은 30자 이내로 입력하세요");history.back();</script>')
                    return
                }
                else if (req.body.content.length > 1000) {
                    res.send('<script>alert("내용은 1000자 이내로 입력하세요");history.back();</script>')
                    return
                }
                else if (req.body.title.includes('<') || req.body.title.includes('>')) {
                    res.send('<script>alert("제목에는 <, > 를 사용할 수 없습니다");history.back();</script>')
                    return
                }
                else if (req.body.content.includes('<') || req.body.content.includes('>')) {
                    res.send('<script>alert("내용에는 <, > 를 사용할 수 없습니다");history.back();</script>')
                    return
                }
                else if (req.body.title.includes('\'') || req.body.title.includes('\"')) {
                    res.send('<script>alert("제목에는 \' 또는 \" 를 사용할 수 없습니다");history.back();</script>')
                    return
                }
                else if (req.body.content.includes('\'') || req.body.content.includes('\"')) {
                    res.send('<script>alert("내용에는 \' 또는 \" 를 사용할 수 없습니다");history.back();</script>')
                    return
                }
                else if (req.file == undefined) {
                    await db.collection('post').insertOne({ title: req.body.title, content: req.body.content, writer: req.user.username })
                    res.redirect('/list')
                }
                else {
                    await db.collection('post').insertOne({ title: req.body.title, content: req.body.content, img: req.file.location, writer: req.user.username })
                    res.redirect('/list')
                }
            } catch (error) {
                console.log(error)
                res.status(500).send(error)
            }
        }
    })
})

app.get('/detail/:postid', async (req, res) => {
    try {
        let result = await db.collection('post').findOne({ _id: new ObjectId(req.params.postid) })
        res.render('detail.ejs', { post: result, user : req.user })
        if (result == null) {
            res.status(404).send('없는 글')
        }
    } catch (error) {
        console.log(error)
        res.status(404).send('이상한 url 입력함')
    }
})

app.get('/edit/:postid', logincheck, async (req, res) => {
    try {
        let result = await db.collection('post').findOne({ _id: new ObjectId(req.params.postid) })
        if (result == null) {
            res.status(404).send('없는 글')
        } else if (result.writer != req.user.username) {
            res.status(404).send('권한이 없습니다')
        }else {
            res.render('edit.ejs', { post: result, user : req.user })
        }
    } catch (error) {
        console.log(error)
        res.status(404).send('이상한 url 입력함')
    }
})

app.put('/edit', logincheck, async (req, res) => {
    try {
        if (req.body._id == '') {
            res.send('<script>alert("잘못된 접근입니다");history.back();</script>')
            return
        }
        else if (req.body.title == '' || req.body.content == '') {
            res.send('<script>alert("내용을 입력하세요");history.back();</script>')
            return
        }
        else if (req.body.title.length > 30) {
            res.send('<script>alert("제목은 30자 이내로 입력하세요");history.back();</script>')
            return
        }
        else if (req.body.content.length > 1000) {
            res.send('<script>alert("내용은 1000자 이내로 입력하세요");history.back();</script>')
            return
        }
        else if (req.body.title.includes('<') || req.body.title.includes('>')) {
            res.send('<script>alert("제목에는 <, > 를 사용할 수 없습니다");history.back();</script>')
            return
        }
        else if (req.body.content.includes('<') || req.body.content.includes('>')) {
            res.send('<script>alert("내용에는 <, > 를 사용할 수 없습니다");history.back();</script>')
            return
        }
        else if (req.body.title.includes('\'') || req.body.title.includes('\"')) {
            res.send('<script>alert("제목에는 \' 또는 \" 를 사용할 수 없습니다");history.back();</script>')
            return
        }
        else if (req.body.content.includes('\'') || req.body.content.includes('\"')) {
            res.send('<script>alert("내용에는 \' 또는 \" 를 사용할 수 없습니다");history.back();</script>')
            return
        }
        else {
            let result = await db.collection('post').updateOne(
                { _id: new ObjectId(req.body._id) },
                { $set: { title: req.body.title, content: req.body.content } }
            )

            console.log(result)
            res.redirect('/list')
        }
    } catch (error) {
        console.log(error)
        res.status(500).send(error)
    }

})

app.delete('/delete', logincheck, async (req, res) => {
    try {
        let result = await db.collection('post').findOne({ _id: new ObjectId(req.query.docid) })
        console.log(result.writer)
        console.log(req.user._id)
        if (result.writer === req.user.username) {
            if (result.img) {
                result.img = result.img.split('/').slice(-1)[0]
                console.log(result.img)
                deleteFile(result.img)
            }
            let result_delete = await db.collection('post').deleteOne({ _id: new ObjectId(req.query.docid) })
            // deleteFile(req.query.img)
            
            console.log(result_delete)
            
            res.send('삭제완료')
            
            // res.redirect('/list')
            
        } else {
            console.log('권한이 없음')
            
        }
        
    } catch (error) {
        console.log(error)
        res.status(500).send(error)
    }  
})

// app.get('/delete/:deleteid', async (req, res) => {
//     try {
//         let result = await db.collection('post').deleteOne({ _id: new ObjectId(req.params.deleteid) })
//         console.log(result)
//         res.redirect('/list')
//     } catch (error) {
//         console.log(error)
//         res.status(500).send(error)
//     }
//     }
// })

app.get('/list/:page', async (req, res) => {
    try {
        let maxpage = await db.collection('post').estimatedDocumentCount()
        maxpage = Math.ceil(maxpage / 3)
        let nowpage = req.params.page
        let result = await db.collection('post').find().skip((req.params.page - 1) * 3).limit(3).toArray()
        // console.log(req.user)
        res.render('list.ejs', { posts: result, maxpage: maxpage, nowpage: nowpage, user : req.user })
    } catch (error) {
        console.log(error)
        res.status(500).send(error)
    }
})

app.get('/register', (req, res) => {
    res.render('register.ejs', { user : req.user })
})

app.post('/register', async (req, res) => {      
    try {
        let result = await db.collection('user').findOne({ username: req.body.username })
        if(req.body.username == '') {
            res.send('<script>alert("ID를 입력하세요");history.back();</script>')
            return
        }
        else if(req.body.password == '') {
            res.send('<script>alert("Password를 입력하세요");history.back();</script>')
            return
        }
        else if(req.body.password.length < 4) {
            res.send('<script>alert("Password는 4자 이상 입력하세요");history.back();</script>')
            return
        }
        else if(result) {
            res.send('<script>alert("이미 존재하는 ID입니다");history.back();</script>')
            return
        }
        else{
            let hash = await bcrypt.hash(req.body.password, 10)
            let result = await db.collection('user').insertOne({ 
                username : req.body.username, 
                password : hash,
                name : req.body.name,
                age : req.body.age,
                img : req.body.img
            })
            console.log(result)
            //회원가입 성공 메시지 출력
            res.send('<script>alert("회원가입 성공");location.href="/login";</script>')

        }
        
    } catch (error) {
        console.log(error)
        res.status(500).send(error)
    }
})

passport.use(new LocalStrategy(async (username, password, cb) => {
    let result = await db.collection('user').findOne({ username: username })
    try {
        if (!result) {
            return cb(null, false, { message: '아이디가 DB에 없음' })
        }
        if (await bcrypt.compare(password, result.password)) {
            return cb(null, result)
        } else {
            return cb(null, false, { message: '비밀번호가 틀림' })
        }

    } catch (error) {
        console.log(error)
    }
    
}))

passport.serializeUser((user, done) => {
    // console.log(user)
    process.nextTick(() => {
        done(null, { id : user._id, username : user.username } )
    })
})

passport.deserializeUser(async (user, done) => {
    let result = await db.collection('user').findOne({ _id: new ObjectId(user.id) })
    delete result.password
    process.nextTick(() => {
        done(null, result)
    })
})

app.get('/login', (req, res) => {
    res.render('login.ejs', { user : req.user })
})

app.post('/login', async (req, res, next) => {
    passport.authenticate('local', (error, user, info) => {
        if(error) return res.status(500).json(error)
        if(!user) return res.status(401).json(info.message)
        req.login(user, (error) => {
            if(error) return next(error)
            res.redirect('/list')
        })
    })(req, res, next)
})

app.get('/logout', logincheck,(req, res) => {
    req.logout(err => {
        if(err) return res.status(500).json(err)
        res.redirect('/list')
    })
})


// app.use('/shop', require('./routes/shop.js'))

// app.get('/mypage', logincheck, (req, res) => {
//     res.render('mypage.ejs', { user : req.user })
// })

app.get('/mypage/:userid', logincheck, async (req, res) => {
    try {
        let result = await db.collection('user').findOne({ _id: new ObjectId(req.params.userid) })
        if (result == null) {
            res.status(404).send('없는 유저')
        } else if (result.username != req.user.username) {
            res.status(404).send('권한이 없습니다')
        } else {
            res.render('mypage.ejs', { user : req.user })
        }
    } catch (error) {
        console.log(error)
        res.status(404).send('이상한 url 입력함')
    }
})

app.get('/mypage_edit/:userid', logincheck, async (req, res) => {
    try {
        let result = await db.collection('user').findOne({ _id: new ObjectId(req.params.userid) })
        
        if (result == null) {
            res.status(404).send('없는 유저')
        } else if (result.username != req.user.username) {
            res.status(404).send('권한이 없습니다')
        } else {
            res.render('mypage_edit.ejs', { user : req.user })
        }
    } catch (error) {
        console.log(error)
        res.status(404).send('이상한 url 입력함')
    }
})
app.post('/mypage_edit', logincheck, async (req, res) => {
    uploadProfile.single('img')(req, res, async (err) => {
        if (err) {
            console.log(err)
            res.send(err.message)
        } else {
            try {
                if(req.body.name=='' || req.body.age=='') {
                    res.send('<script>alert("내용을 입력하세요");history.back();</script>')
                    return
                }
                else if(req.body.name.length > 10) {
                    res.send('<script>alert("이름은 10자 이내로 입력하세요");history.back();</script>')
                    return
                }
                else if(req.body.age < 0 || req.body.age > 100) {
                    res.send('<script>alert("나이는 0~100 사이로 입력하세요");history.back();</script>')
                    return
                }
                else if (req.file == undefined && req.body.profile_img_changed == 1) {
                    let result = await db.collection('user').updateOne(
                        { _id: new ObjectId(req.body._id) },
                        { $set: { name: req.body.name, age: req.body.age, img: "", texts: req.body.texts } }
                    )
                    //원래 이미지 삭제
                    old_img = "profile/" + req.body.old_img.split('/').slice(-1)[0]
                    deleteFile(old_img)
                    res.redirect('/mypage/'+req.body._id)
                }
                else if (req.file==undefined && req.body.profile_img_changed == 0) {
                    let result = await db.collection('user').updateOne(
                        { _id: new ObjectId(req.body._id) },
                        { $set: { name: req.body.name, age: req.body.age, img: req.body.old_img, texts: req.body.texts } }
                    )
                    res.redirect('/mypage/'+req.body._id)
                }
                else {
                    let result = await db.collection('user').updateOne(
                        { _id: new ObjectId(req.body._id) },
                        { $set: { name: req.body.name, age: req.body.age, img: req.file.location, texts: req.body.texts } }
                    )
                    console.log(req.file)

                    //원래 이미지 삭제
                    old_img = "profile/" + req.body.old_img.split('/').slice(-1)[0]
                    deleteFile(old_img)
                    res.redirect('/mypage/'+req.body._id)
                }
            } catch (error) {
                console.log(error)
                res.status(500).send(error)
            }
        }
    })
})
// app.put('/mypage_edit', logincheck, async (req, res) => {
//     upload.single('img')(req, res, async (err) => {
//         if (err) {
//             console.log(err)
//             res.send(err.message)
//         } else {
//             try {
//                 if(req.body.name=='' || req.body.age=='') {
//                     res.send('<script>alert("내용을 입력하세요");history.back();</script>')
//                     return
//                 }
//                 else if(req.body.name.length > 10) {
//                     res.send('<script>alert("이름은 10자 이내로 입력하세요");history.back();</script>')
//                     return
//                 }
//                 else if(req.body.age < 0 || req.body.age > 100) {
//                     res.send('<script>alert("나이는 0~100 사이로 입력하세요");history.back();</script>')
//                     return
//                 }
//                 else if (req.file == undefined) {
//                     let result = await db.collection('user').updateOne(
//                         { _id: new ObjectId(req.body._id) },
//                         { $set: { name: req.body.name, age: req.body.age } }
//                     )
//                     console.log(result)
//                     console.log("이미지 없음")
//                     res.redirect('/mypage/'+req.body._id)
//                 } else {
//                     let result = await db.collection('user').updateOne(
//                         { _id: new ObjectId(req.body._id) },
//                         { $set: { name: req.body.name, age: req.body.age, img: req.file.location } }
//                     )
//                     console.log(result)
//                     res.redirect('/mypage/'+req.body._id)
//                 }
//             } catch (error) {
//                 console.log(error)
//                 res.status(500).send(error)
//             }
//         }
//     })

// })