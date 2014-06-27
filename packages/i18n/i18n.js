var data = { 'zh-cn':{
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
  "Reset password":"重置密码"
}
}

getLocal = function (){
   return 'zh-cn';
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

_$ = function(str, vars){
    var local = data[getLocal()],
        s;
    if(!local){
        s = str;    
    }else{
        s = local[str] || str;
    }

    return s.format(vars);
}


















