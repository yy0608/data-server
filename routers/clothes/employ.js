var express = require('express');
var router = express.Router();
var session = require('express-session');
var axios = require('axios');
var crypto = require('crypto');
var CaptchaSDK = require('dx-captcha-sdk')
var QcloudSms = require("qcloudsms_js") // 腾讯云短信服务

var RedisStore = require('connect-redis')(session);

var EmployUser = require('../../models/clothes/EmployUser.js');
var MerchantUser = require('../../models/clothes/MerchantUser.js');
var MerchantShop = require('../../models/clothes/MerchantShop.js');
var GoodsCategory = require('../../models/clothes/GoodsCategory.js');
var ShopGoods = require('../../models/clothes/ShopGoods.js');

var utils = require('../../utils.js');
var config = require('./config.js');

var ssender = undefined;
var accessKey = undefined, secretKey = undefined, mac = undefined, resourceConfig = undefined, bucketManager = undefined

router.use(session({
  secret: 'clothes_session',
  name: 'leave-me-alone', // 留在首页的cookie名称
  store: new RedisStore({
    client: global.redisClient,
    // host: 'localhost',
    // port: 6379
  }),
  cookie: {
    maxAge: 60 * 60 * 1000 // 一小时
  },
  resave: true, // :(是否允许)当客户端并行发送多个请求时，其中一个请求在另一个请求结束时对session进行修改覆盖并保存。如果设置false，可以使用.touch方法，避免在活动中的session失效。
  saveUninitialized: false // 初始化session时是否保存到存储
}))

router.post('/login', function (req, res, next) {
  var reqBody = req.body;
  if (JSON.stringify(reqBody) === '{}' && req.session.userInfo) {
    var userInfo = {}
    try {
      userInfo = JSON.parse(req.session.userInfo)
      res.json({
        success: true,
        msg: '登录状态有效',
        user_info: userInfo
      })
    } catch (e) {
      res.json({
        success: false,
        msg: '解析错误'
      })
    }
    return
  }
  var username = reqBody.username && reqBody.username.trim();
  var password = reqBody.password;
  var dxToken = reqBody.dxToken;
  req.session.userInfo = '';
  if (!username || !password || !dxToken) {
    res.json({
      success: false,
      msg: '缺少参数或session已过期'
    })
    return
  }

  var captcha = new CaptchaSDK('b971bdbee8e1d2780783782d066d0cf8', 'de85519b7bded1dab9a2ad1f4db195a5')
  captcha.verifyToken(dxToken)
    .then((response) => {
      var hash = crypto.createHash('md5');
      hash.update(config.passwordKey.left + password + config.passwordKey.right);
      EmployUser.findOne({
        username: username,
        password: hash.digest('hex')
      }, { password: 0 })
        .then(data => {
          if (data) {
            req.session.userInfo = JSON.stringify(data)
            res.json({
              success: true,
              msg: '登录成功',
              user_info: data
            })
          } else { // 用户不存在
            res.json({
              success: false,
              msg: '用户名或密码错误'
            })
          }
        })
        .catch(err => {
          res.json({
            success: false,
            msg: '登录失败',
            err: err
          })
        })
    }).catch(err => {
      res.json({
        success: false,
        code: 10001,
        msg: '验证码错误或失效，请重新验证',
        err_msg: err
      })
    })
})

router.post('/logout', function (req, res, next) {
  req.session.userInfo = '';
  res.json({
    success: true,
    msg: '退出成功'
  })
})

router.post('/user_add', function (req, res, next) {
  var reqBody = req.body;
  var username = reqBody.username && reqBody.username.trim();
  var password = reqBody.password;
  var name = reqBody.name;
  if (!username || !password || !name) {
    res.json({
      success: false,
      msg: '缺少参数'
    })
    return
  }
  EmployUser.findOne({
    username: username
  })
    .then(data => {
      if (data) {
        res.json({
          success: false,
          msg: '用户已存在'
        })
      } else {
        var hash = crypto.createHash('md5');
        hash.update(config.passwordKey.left + password + config.passwordKey.right);
        var user = new EmployUser({
          username: username,
          name: name,
          password: hash.digest('hex')
        })
        user.save()
          .then(() => {
            res.json({
              success: true,
              msg: '添加用户成功'
            })
          })
          .catch(err => {
            res.json({
              success: false,
              msg: '添加用户失败',
              err: err
            })
          })
      }
    })
})

router.post('/delete', function (req, res, next) {
  var reqBody = req.body;
  var _id = reqBody._id && reqBody._id.trim();
  if (!_id) {
    res.json({
      success: false,
      msg: '缺少参数'
    })
  } else {
    EmployUser.remove({
      _id: _id
    })
      .then(data => {
        res.json({
          success: true,
          msg: '删除用户成功'
        })
      })
      .catch(err => {
        res.json({
          success: false,
          msg: '删除用户失败',
          err: err
        })
      })
  }
})

router.get('/list', function (req, res, next) {
  EmployUser.find()
    .then(data => {
      res.json({
        success: true,
        msg: '查询用户列表成功',
        list: data
      })
    })
    .catch(err => {
      res.json({
        success: true,
        msg: '查询用户列表失败',
        err: err
      })
    })
})

router.post('/add_merchant_sms', function (req, res, next) { // 添加商家时发送短信验证码
  var reqBody = req.body
  var phone = reqBody.phone
  if (!phone || phone.length !== 11) {
    res.json({
      success: false,
      msg: '手机号错误'
    })
    return
  }

  var code = Math.random().toString().substr(2, 6)
  // console.log(code)

  // global.redisClient.set(phone, code, function (err, res) {
  //   global.redisClient.expire(phone, 120)
  // })
  // res.json({
  //   success: true,
  //   msg: '短信发送成功'
  // })
  // return;

  var smsConfig = config.smsConfig;
  var qcloudsms = QcloudSms(smsConfig.appid, smsConfig.appkey)
  var code = Math.random().toString().substr(2, 6)
  ssender = ssender || qcloudsms.SmsSingleSender() // 单发短信
  // ssender = ssender || qcloudsms.SmsMultiSender() // 群发短信
  ssender.send(smsConfig.smsType, 86, phone, code + " 为您的登录验证码，请于 2 分钟内填写。如非本人操作，请忽略本短信。", "", "", function (err, response, resData) {
    if (err) {
      res.json({
        success: false,
        msg: '短信发送失败',
        err: err
      })
    } else {
      if (resData.result) {
        res.json({
          success: false,
          msg: '短信发送失败',
          err: resData
        })
      } else {
        global.redisClient.set(phone, code, function (err, res) {
          global.redisClient.expire(phone, 120)
        })
        res.json({
          success: true,
          msg: '短信发送成功',
          data: resData
        })
      }
    }
  });
})

router.post('/merchant_add', function (req, res, next) { // 添加商家账号
  var reqBody = req.body;
  var phone = reqBody.phone && reqBody.phone.trim();
  var manager = reqBody.manager;
  var email = reqBody.email;
  var name = reqBody.name;
  var address = reqBody.address;
  var desc = reqBody.desc;
  var code = reqBody.code;

  if (!phone || phone.length !== 11 || !manager || !email || !name || !address || !code) {
    return res.json({
      success: false,
      msg: '缺少参数或参数错误'
    })
  }

  global.redisClient.get(phone, function (err, v) {
    if (err) {
      res.json({
        success: false,
        msg: 'redis处理异常'
      })
      return
    }
    if (v !== code) {
      res.json({
        success: false,
        msg: '短信验证码错误或失效'
      })
    } else {
      redisClient.del(phone); // 删除
      MerchantUser.findOne({
        phone: phone
      })
        .then(data => {
          if (data) {
            res.json({
              success: false,
              msg: '手机号已注册'
            })
          } else {
            var password = utils.randomWord(true, 40, 43);
            var hash = crypto.createHash('md5');
            hash.update(config.passwordKey.left + password + config.passwordKey.right);
            var merchantUser = new MerchantUser({
              phone: phone,
              password: hash.digest('hex'),
              manager: manager,
              email: email,
              name: name,
              address: address,
              desc: desc,
              created_ts: Date.now()
            })
            merchantUser.save()
              .then(() => {
                res.json({
                  success: true,
                  msg: '添加成功',
                  data: {
                    phone: phone,
                    password: password
                  }
                })
              })
              .catch(err => {
                res.json({
                  success: false,
                  msg: '添加失败',
                  err: err
                })
              })
          }
        })
      .catch(err => {
        res.json({
          success: false,
          msg: '数据库查询出错',
          err: err
        })
      })
    }
  })
})

router.get('/merchant_detail', function (req, res, next) {
  var _id = req.query._id;
  if (!_id) {
    return res.json({
      success: false,
      msg: '缺少参数或参数错误'
    })
  }
  MerchantUser.findOne({ _id: _id })
    .then(data => {
      if (!data) {
        return res.json({
          success: false,
          msg: '商家不存在'
        })
      }
      res.json({
        success: true,
        msg: '获取商家详情成功',
        data: data
      })
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '获取商家详情失败',
        err: err.toString()
      })
    })
})

router.get('/merchant_list', function (req, res, next) {
  var reqQuery = req.query
  var parsePage = parseInt(reqQuery.page)
  var parseLimit = parseInt(reqQuery.limit)
  var page = isNaN(parsePage) || parsePage <= 0 ? 1 : parsePage
  var limit = isNaN(parseLimit) ? config.pageLimit : parseLimit
  var skip = (page - 1) * limit
  MerchantUser.count()
    .then(count => {
      if (!count) {
        res.json({
          success: true,
          msg: '获取商家列表成功',
          count: 0,
          data: []
        })
      } else {
        MerchantUser.find({}, { password: 0 }).limit(limit).skip(skip).sort({ _id: -1 })
          .then(data => {
            res.json({
              success: true,
              msg: '获取商家列表成功',
              count: count,
              data: data
            })
          })
          .catch(err => {
            res.json({
              success: false,
              msg: '获取商家列表失败',
              err: err
            })
          })
      }
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '获取商家列表总条数失败',
        err: err
      })
    })
})

router.post('/merchant_edit', function (req, res, next) {
  var reqBody = req.body;
  var _id = reqBody._id;
  var phone = reqBody.phone && reqBody.phone.trim();
  var manager = reqBody.manager;
  var email = reqBody.email;
  var name = reqBody.name;
  var address = reqBody.address;
  var desc = reqBody.desc;
  var code = reqBody.code;

  if (!_id || !phone || phone.length !== 11 || !manager || !email || !name || !address || !code) {
    return res.json({
      success: false,
      msg: '缺少参数或参数错误'
    })
  }

  global.redisClient.get(phone, function (err, v) {
    if (err) {
      res.json({
        success: false,
        msg: 'redis处理异常'
      })
      return
    }
    if (v !== code) {
      res.json({
        success: false,
        msg: '短信验证码错误或失效'
      })
    } else {
      redisClient.del(phone); // 删除
      // MerchantUser.update({ _id: _id }, {
      MerchantUser.findOneAndUpdate({ _id: _id }, {
        manager, email, name, address, desc
      })
        .then(() => {
          res.json({
            success: true,
            msg: '修改商家信息成功'
          })
        })
        .catch(err => {
          res.json({
            success: false,
            msg: '修改商家信息失败'
          })
        })
    }
  })
})

router.post('/shop_add', function (req, res, next) {
  var reqBody = req.body;
  var location, longitude, longitude
  if (reqBody.location && typeof(reqBody.location) === 'string') {
    location = reqBody.location.split(',')
    longitude = parseFloat(location[0])
    latitude = parseFloat(location[1])
  }
  if (!reqBody.merchant_id || Object.keys(reqBody).length < 9 || isNaN(latitude) || isNaN(longitude)) {
    res.json({
      success: false,
      msg: '缺少参数或参数错误'
    })
    return
  }
  reqBody.location = [longitude, latitude]

  var isWebUrl = /(http:\/\/)|(https:\/\/)/.test(reqBody.logo)
  var originKey = reqBody.logo;
  var filename = undefined;
  var destKey = undefined;
  if (!isWebUrl) {
    filename = reqBody.logo.split('/')[reqBody.logo.split('/').length - 1];
    destKey = config.qiniuConfig.shopLogoDirname + filename;
    reqBody.logo = destKey
  }

  var merchantShop = new MerchantShop(reqBody)
  merchantShop.save()
    .then(() => {
      res.json({
        success: true,
        msg: '添加店铺成功'
      })
      if (!isWebUrl) { // 如果是上传到七牛的，移动图片
        utils.resourceMove({
          srcKey: originKey,
          destKey: destKey,
          error: function (err) {
            utils.writeQiniuErrorLog('单个移动商品logo出错，err: ' + err)
          }
        })
      }
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '添加店铺失败',
        err: err
      })
    })
})

router.get('/merchant_shops', function (req, res, next) { // 查询店铺列表，传商家id即该商家下的店铺列表
  var reqQuery = req.query
  var parsePage = parseInt(reqQuery.page)
  var parseLimit = parseInt(reqQuery.limit)
  var page = isNaN(parsePage) || parsePage <= 0 ? 1 : parsePage
  var limit = isNaN(parseLimit) ? config.pageLimit : parseLimit
  var skip = (page - 1) * limit
  var conditions = reqQuery.merchant_id ? { merchant_id: reqQuery.merchant_id } : {}
  MerchantShop.find(conditions).count()
    .then(count => {
      if (!count) {
        res.json({
          success: true,
          msg: '获取店铺列表成功',
          count: 0,
          data: []
        })
      } else {
        var populateOptions = reqQuery.merchant_id ? '' : {
          path: 'merchant_id',
          select: {
            password: 0
          },
          options: {
            limit: 1
          }
        };
        // MerchantShop.find(conditions).populate(populateOptions).limit(limit).skip(skip).sort({ _id: -1 })
        //   .exec(function (err, shops) {
        //     if (err) return console.log(err)
        //     shops = shops.filter(function (shop) {
        //       return shop.merchant_id
        //     })
        //     res.json({
        //       data: shops,
        //       msg: '123123sdf'
        //     })
        //   })
        MerchantShop.find(conditions).limit(limit).skip(skip).populate(populateOptions).sort({ _id: -1 })
          .then(data => {
            res.json({
              success: true,
              msg: '获取店铺列表成功',
              count: count,
              data: data
            })
          })
          .catch(err => {
            res.json({
              success: false,
              msg: '获取店铺列表出错',
              err: err
            })
          })
      }
    })
})

router.get('/shop_detail', function (req, res, next) {
  var _id = req.query.shop_id;
  if (!_id) {
    return res.json({
      success: false,
      msg: '缺少参数'
    })
  }
  MerchantShop.findOne({ _id: _id })
    .then(data => {
      if (!data) {
        return res.json({
          success: false,
          msg: '店铺不存在'
        })
      }
      res.json({
        success: true,
        msg: '查询店铺详情成功',
        data: data
      })
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '查询店铺详情出错',
        err: err.toString()
      })
    })
})

router.post('/shop_edit', function (req, res, next) {
  var reqBody = req.body;
  var _id = reqBody._id;
  if (!_id || Object.keys(reqBody).length < 8) {
    return res.json({
      success: false,
      msg: '缺少参数或参数错误'
    })
  }
  delete reqBody._id
  if (reqBody.logo && reqBody.logo !== reqBody.origin_logo) {
    var isWebUrl = /(http:\/\/)|(https:\/\/)/.test(reqBody.logo);
    var originKey = reqBody.logo;
    var filename = undefined;
    var destKey = undefined;
    if (!isWebUrl) {
      utils.resourceDelete({ // 删除logo
        key: reqBody.origin_logo,
        success: function (res) {
          filename = reqBody.logo.split('/')[reqBody.logo.split('/').length - 1];
          destKey = config.qiniuConfig.shopLogoDirname + filename;
          reqBody.logo = destKey

          utils.resourceMove({ // 移动logo
            srcKey: originKey,
            destKey: destKey,
            success: function (res) {
            },
            error: function (err) {
              utils.writeQiniuErrorLog('修改店铺logo图，单个移动过程失败，err: ' + err)
            }
          })
        },
        error: function (err) {
          utils.writeQiniuErrorLog('修改店铺logo图，单个删除过程失败，err: ' + err)
        }
      })
    }
  }
  delete reqBody.origin_logo
  var location, longitude, longitude
  if (reqBody.location && typeof(reqBody.location) === 'string') {
    location = reqBody.location.split(',')
    longitude = parseFloat(location[0])
    latitude = parseFloat(location[1])
  }
  reqBody.location = [longitude, latitude]
  MerchantShop.findOneAndUpdate({ _id: _id }, reqBody)
    .then(() => {
      res.json({
        success: true,
        msg: '店铺修改成功'
      })
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '店铺修改失败',
        err: err.toString()
      })
    })
})

router.get('/near_shops', function (req, res, next) { // 查询附近的店铺，当前位置必传
  var reqQuery = req.query;
  var parsePage = parseInt(reqQuery.page)
  var parseLimit = parseInt(reqQuery.limit)
  var page = isNaN(parsePage) || parsePage <= 0 ? 1 : parsePage
  var limit = isNaN(parseLimit) ? config.pageLimit : parseLimit
  var skip = (page - 1) * limit
  if (!reqQuery.location || typeof(reqQuery.location) !== 'string') {
    res.json({
      success: false,
      msg: '缺少参数或参数错误'
    })
    return
  }
  var maxDistance = reqQuery.max_distance
  var locationArr, longitude, longitude
  locationArr = reqQuery.location.split(',')
  longitude = parseFloat(locationArr[0])
  latitude = parseFloat(locationArr[1])
  var locationRes = [ longitude, latitude ]
  // var locationOptions = maxDistance ? {
  //   $nearSphere: locationRes,
  //   $maxDistance: parseFloat(maxDistance) / 6371 // 此处要转换为弧度，6371为地球半径，单位km
  // } : { $nearSphere: locationRes }

  MerchantShop.aggregate([{ // 返回带距离的数据，单位是米
    '$geoNear': {
      'near': {
          'type': 'Point',
          'coordinates': locationRes
        },
      'spherical': true,
      'distanceField': 'distance_m', // 最后生成的距离字段
      'limit': limit
    }
  }, { '$skip': skip }])
    .then(data => {
      res.json({
        success: true,
        msg: '获取附近店铺成功',
        data: data
      })
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '获取附近店铺失败',
        err: err.toString()
      })
    })

  // MerchantShop.geoNear(locationRes, { spherical: true, limit: limit}) // 返回带距离的数据，单位是弧度，要乘以地球半径8371，但是没有skip参数
  //   .then(data => {
  //     res.json({
  //       success: true,
  //       msg: '获取附近店铺成功',
  //       data: data
  //     })
  //   })
  //   .catch(err => {
  //     res.json({
  //       success: false,
  //       mag: '获取附近店铺失败',
  //       err: err.toString()
  //     })
  //   })

  // MerchantShop.find({ 'location': locationOptions }).limit(limit).skip(skip) // 返回不带距离的数据
  //   .then(data => {
  //     res.json({
  //       success: true,
  //       msg: '获取附近店铺成功',
  //       data: data
  //     })
  //   })
  //   .catch(err => {
  //     res.json({
  //       success: false,
  //       mag: '获取附近店铺失败',
  //       err: err.toString()
  //     })
  //   })
})

router.post('/category_add', function (req, res, next) {
  var reqBody = req.body;
  var name = reqBody.name;
  var desc = reqBody.desc;
  var icon = reqBody.icon;
  var level = reqBody.parent.length + 1;
  var parentId = reqBody.parent[reqBody.parent.length - 1];

  GoodsCategory.findOne({
    level: level,
    name: name
  }).then(data => {
    if (data) {
      res.json({
        success: false,
        msg: '该级分类下已存在相同名称'
      })
    } else {
      var goodsCategory = undefined;
      if (parentId) {
        goodsCategory = new GoodsCategory({
          name: name,
          desc: desc,
          level: level,
          icon: icon,
          parent_id: parentId
        })
      } else {
        goodsCategory = new GoodsCategory({
          name: name,
          desc: desc,
          level: level,
          icon: icon
        })
      }

      goodsCategory.save()
        .then(data => {
          console.log(data)
          res.json({
            success: true,
            msg: '添加分类成功'
          })
        })
        .catch(err => {
          res.json({
            success: false,
            msg: '添加分类失败',
            err: err
          })
        })
    }
  }).catch(err => {
    res.json({
      success: false,
      msg: '添加分类失败',
      err: err
    })
  })
})

router.get('/goods_categories', function (req, res, next) {
  var reqQuery = req.query;
  var level = reqQuery.level;
  var conditions = level ? { level: level } : {};
  GoodsCategory.find(conditions)
    .then(data => {
      res.json({
        success: true,
        data: data
      })
    })
    .catch(err => {
      res.json({
        success: false,
        err: err
      })
    })
})

router.get('/category_detail', function (req, res, next) {
  var _id = req.query._id;
  if (!_id) {
    return res.json({
      success: false,
      msg: '缺少参数'
    })
  }
  GoodsCategory.findOne({ _id })
    .then(data => {
      if (!data) {
        return res.json({
          success: false,
          msg: '分类不存在'
        })
      }
      res.json({
        success: true,
        msg: '获取分类详情成功',
        data: data
      })
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '获取分类详情出错',
        err: err.toString()
      })
    })
})

router.post('/category_edit', function (req, res, next) {
  res.json({
    success: true
  })
})

router.post('/goods_add', function (req, res, next) {
  var reqBody = req.body;
  var shopId = reqBody.shop_id;
  var categoryId = reqBody.category_id;
  var title = reqBody.title;
  var valuation = reqBody.valuation;
  var figureImgs = reqBody.figure_imgs;
  var detailImgs = reqBody.detail_imgs;
  if (!shopId || !title || !valuation || !categoryId || !(figureImgs instanceof Array) || !figureImgs.length || !(detailImgs instanceof Array) || !detailImgs.length) {
    return res.json({
      success: false,
      msg: '缺少参数或参数错误'
    })
  }

  MerchantShop.findOne({ _id: shopId })
    .then(data => {
      if (!data) {
        return res.json({
          success: false,
          msg: '店铺不存在'
        })
      }

      // 商品轮播图部分
      var goodsFigureDirname = config.qiniuConfig.goodsFigureDirname;
      var movedFigureImgs = [];
      figureImgs.forEach(function (item, index, arr) {
        var filename = item.split('/')[item.split('/').length - 1]
        movedFigureImgs.push(goodsFigureDirname + filename);
      })

      // 商品详情图部分
      var goodsDetailDirname = config.qiniuConfig.goodsDetailDirname;
      var movedDetailImgs = [];
      detailImgs.forEach(function (item, index, arr) {
        var filename = item.split('/')[item.split('/').length - 1]
        movedDetailImgs.push(goodsDetailDirname + filename);
      })

      var shopGoods = new ShopGoods({
        merchant_id: data.merchant_id,
        shop_id: shopId,
        category_id: categoryId,
        title: title,
        valuation: valuation,
        figure_imgs: movedFigureImgs,
        detail_imgs: movedDetailImgs,
        created_ts: Date.now()
      })
      shopGoods.save()
        .then(data => {
          res.json({
            success: true,
            _id: data._id,
            msg: '商品添加成功'
          })

          utils.resourceMoveBatch({
            srcKeys: figureImgs,
            destDirname: goodsFigureDirname,
            error: function (err) {
              utils.writeQiniuErrorLog('批量移动商品轮播图片失败，err: ' + err)
            }
          })
          utils.resourceMoveBatch({
            srcKeys: detailImgs,
            destDirname: goodsDetailDirname,
            error: function (err) {
              utils.writeQiniuErrorLog('批量移动商品详情图片失败，err: ' + err)
            }
          })
        })
        .catch(err => {
          res.json({
            success: false,
            msg: '商品添加失败',
            err: err.toString()
          })
        })
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '查询店铺失败',
        err: err.toString()
      })
    })
})

router.get('/goods_list', function (req, res, next) {
  var queryOptions = req.query.shop_id ? { shop_id: req.query.shop_id } : {}
  ShopGoods.find(queryOptions).populate([{
    path: 'merchant_id'
  }, {
    path: 'shop_id'
  }, {
    path: 'category_id'
  }])
    .then(data => {
      res.json({
        success: true,
        msg: '获取商品列表成功',
        data: data
      })
    })
    .catch(err => {
      res.json({
        success: false,
        msg: '获取商品列表失败',
        err: err.toString()
      })
    })
})

// utils.resourceDelete({
//   key: 'cache/icon_test/1c8c3ce7-11cd-4cb0-8ec1-a19fc4beda5e.jpg',
//   error: function (err) {
//     console.log(err)
//   },
//   success: function (res) {
//     console.log(res)
//   }
// })

module.exports = router
