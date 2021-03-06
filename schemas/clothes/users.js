var mongoose = require('mongoose');

module.exports = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  is_admin: {
    type: Boolean,
    default: false
  },
  nickname: {
    type: String,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  user_info: { // 小程序获取的用户信息
    type: String,
    default: ''
  },
  collected_topics: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  }],
  /*错误示例！！！！！！！！！
  collected_topics: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Topic'
  }
  */

  // collected_topics: [{
  //   topic_id: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'Topic'
  //   },
  //   created_ts: {
  //     type: Number,
  //     default: Date.now
  //   }
  // }]

  collected_goods: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShopGoods'
  }],
  concerned_shops: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MerchantShop'
  }]
}, {
  versionKey: false, // 去掉__v字段
  timestamps: true // 添加创建时间和更新时间
})
