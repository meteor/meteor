
var alldata = {
    "Meteor Accounts <no-reply@meteor.com>":"417610285@qq.com"
}

var data = { 'zh-cn':{
  'Name':'昵称',
  'Username':"用户名",
  'Password':"密码",
  'Create account':"注册",
  'Forgot password':"忘记密码",
  "Email":"邮件",
  "Sign in":"登录",
  "Close":"关闭",
  "Invalid email":"邮件地址错误",
  "User not found":"用户没有找到",
  "Password must be at least 6 characters long":"密码长度最少六个字符",
  "email not verified": "账户已经注册，但是邮箱没有经过验证请检查邮件.",
  "Change password":"更改密码",
  "Sign out":"退出",
  "Current Password":"当前密码",
  "New Password":"新密码",
  "Incorrect password":"密码错误",
  "Reset password":"重置密码",
  "Email already exists.":"已经注册过了！",
  "resend":"点击重新发送",
  "Password is old. Please reset your password.":"新旧密码一样。请重新设置。"
}
}
var language = 'en';
i18n = {};

if(Meteor.isClient){
  i18n.getLanguage = function(){
  	return Session.get('language');
  }
  
  i18n.setLanguage = function(lan){
    Session.set('language', lan);
    
    Meteor.call('setLanguage', lan);
  }
}

if(Meteor.isServer){
    i18n.getLanguage = function (){
    console.log(Meteor.s_sessions);
    try{
        return Meteor.my_session().get('language') || language; 
    }catch(e){
    }
	return language;
  }
  
  Meteor.methods({'setLanguage':function( lan){

      Meteor.my_session().set('language', lan);

  }


  });
                     
  i18n.setLanguage = function(lan){
    Meteor.call('setLanguage', lan);
  }

}





String.prototype.format=function(o){
    /*
    @des:格式化字符串,javascript 占位符
    @param o:{key:value}, [value,,]
    @eg:
        var str = '{part}boneyao.com';
        var  o = {part:'www.'};
        str.format( o) == www.boneyao.com
        
        var str = '{0}{1}boneyao.com';
        str.format( 'www','.') == www.boneyao.com
        
    */

    if(typeof(o)==typeof('')||typeof(o)==typeof(1)){
        o = [o];
        for(i = 1 ; i < arguments.length ; i++){
            o.push(arguments[i]);
        }
    }
    var str = this;
    return str.replace(/{\w*}/g, function (w) { 
        r = w.substr(1,w.length-2);//去除{} 
        return (o[r]===0)?0:(o[r] ? o[r] : "");//o[r]===0这句是为了实现当值为0时输出0而不是空。 
    }); 
};
  

Meteor._$ = function(str, vars){
  
    var local = data[i18n.getLanguage()],
        s;
  if(!local)local = {};
  for(var i in alldata){
      local[i] = alldata[i];
  }

        s = local[str] || str;
    

    return s.format(vars);
}

_$ = function(str, vars){
  return Meteor._$(str, vars)
};




if(Meteor.isClient) {
  if(UI) {
    UI.registerHelper('_', function (NAV, F) {
      return _$(NAV, F);
    });
  } else if(Handlebars) {
    Handlebars.registerHelper('_', function (NAV, F) {
      return _$(NAV, F);
    });
  }
}























