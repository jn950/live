### Android 自带的 WebView 更新

#### 一、Android 7

在安卓7系统里，一般内置的浏览器内核为很低版本，如52.0.2743.100。导致前端的新语法不支持，如ES6的语法最基本的 async，媲美老 IE 的环境。

##### 前言

在设置 - 应用 - 显示系统应用里面看到有 Android System WebView 程序，但版本很低。开发者选项 - WebView 实现中，一般只有一个 Android WebView，包名为 com.android.webview。

那我们能不能自己安装一个 WebView，然后在 WebView 实现里面设置？实测不行，就算安装成功，也不会新安装的 WebView 选项。

下面开始升级教程，前提：ROOT；推荐工具：MT管理器。



##### 1、准备自己想要的 WebView 版本

可以从在“酷安”里面搜索 WebView，之后在评论区找到老哥搬运的最新版本即可（向老哥致敬）。

或者在外网的镜像网站下载，如 [Android System WebView APK Download (softpedia.com)](https://mobile.softpedia.com/apk/android-system-webview/) 网站下载（龟速）。



##### 2、安装 WebView 为系统软件

我这里是直接使用 MT 文件管理器将 apk 稍微改一下文件名，之后放在 /system./app 目录下，改权限为 -rw-r--r--，之后重启。

重启之后，在 设置-应用-右上角“显示系统进程”，看有没有多出来新安装的 WebView 应用。

如果没有，可以尝试删除刚放在  /system./app 下的 WebView apk，之后按普通应用安装流程安装，之后用 钛备份 去转为系统应用。

> 可能直接安装为普通应用也行，我没试过，但是直觉告诉我应该行（狗头）。
>
> 附上我创建的仓库：[Aken/Android-WebView (gitee.com)](https://gitee.com/akenclub/android-web-view)，里面放了几个我搜刮来的新旧版本 WebView APK。



##### 3、反编译修改 framework-res.apk 配置

- 在 /system/framework 文件夹找到 framework-res.apk 文件

- 复制 framework-res.apk 文件到其他地方进行**备份**，以免翻车能替换回去。

- 点击 apk - 查看，进入 res/xml，找到 config_webview_packages.xml 打开，选择 反编译。

- ![image-20220816155849058](https://gitee.com/akenclub/android-web-view/raw/master/Android%20WebView%20%E6%9B%B4%E6%96%B0.assets/image-20220816155849058.png)

- 此时看到这个 xml 文件里，已经有一个 webviewprovider，里面包名就是系统内置的 webview，com.android.webview 是很旧的了，之后更新的 webview 已经改为 com.google.android.webview。

- 模仿现有的，增加以下代码：

  description：自己定义一个名称，会显示在开发者选项 - WebView 实现里面。

  packageName：为新安装的 WebView 程序的包名，现在新版本的都是 com.google.android.webview。

  availableByDefault：直接设置新 WebView 为 true，默认使用。不过，实测设置了也没用，还是要到开发者选项设置后才行。所以这里 true / false 都行，但所有 webviewprovider 应该只存在一个 true。

  ```xml
  <?xml version="1.0" encoding="utf-8"?>
  <webviewproviders>
      <webviewprovider
          description="WebView103"
          packageName="com.google.android.webview"
          availableByDefault="true" />
          
          <webviewprovider
          description="Android WebView"
          packageName="com.android.webview"
          availableByDefault="false" />
  </webviewproviders>
  ```

- 保存后，返回上一级，将提示文件已被修改，点击确定，不用勾选“自动签名”。

- 一层层返回到  /system/framework，会看到多出 framework-res.apk.bak（MT 管理器自己的备份） 和 已经修改好的 framework-res.apk。

- 重启设备。

  

##### 4、开发者选项中设置

- 一般在设置 - 关于，连续点击 系统版本号，就能触发隐藏的开发者选项。

- 在开发者选项中，在 WebView 实现里面可以看到刚刚新增的 WebView103，选中。

  ![image-20220817083610610](https://gitee.com/akenclub/android-web-view/raw/master/README.assets/image-20220817083610610.png)
  
  

##### 5、检验成果

- [浏览器内核检测 (ghxi.com)](https://www.ghxi.com/llq)

- [浏览器内核版本检测--浏览迷 (liulanmi.com)](https://liulanmi.com/labs/core.html)

- 上面的网站都能看到当前的内核版本

  ![image-20220816161959600](https://gitee.com/akenclub/android-web-view/raw/master/Android%20WebView%20%E6%9B%B4%E6%96%B0.assets/image-20220816161959600.png)

#### 二、Android 9

在安卓9的系统中，自带的浏览器内核也不会太旧了，基本满足前端的语法。下面说说我升级的过程：

- 首先是看到自带的 WebView 包名也是 com.google.android.webview，那么就想到直接安装。
- 如果能直接安装，大概率就直接升级成功了，不用继续往下看。
- 但是我碰到了签名不同导致安装失败。于是进入 /system/app/webview 文件夹，把里面文件备份，之后清空文件夹，再把你要安装的 WebView apk 重命名为 文件夹中之前存在的 apk 名称，如我这里是 webview.apk，改权限为 -rw-r--r--，之后重启。（替换大法）
- 这里的签名冲突应该也可以通过 核心破解 去解决，这又是另外一条路子了。
- 用上面的网站去检验你的成果即可。

#### 三、后话

1、看到有朋友说可以在安装 WebView 后，直接用 ADB 去给 WebView 实现去增加新 WebView 的选择项，代码为：

```shell
adb shell settings put global webview_provider com.google.android.webview
```

但是我设置重启后，还是没效果。当然，这可能是我系统不行，你们可以先试一下这个方法。

可以用下面这个代码查看：

```
adb shell settings get global webview_provider
```

ps：我手动修改 framework-res.apk 之后，再 get 一下配置，得到的还是没有我新增的，但是在 WebView 实现里面已经有候选项了。

2、碰到安装失败的，可以用 MT管理器去 /system/app/webview 文件夹的 apk 文件看看自带的 WebView apk 包名，包名相同的，可能是签名问题，这个没 root 估计搞不了。

3、安卓开发的朋友，WebView 使用的时候一般不要设置软件加速，除非碰到一些显示的问题。软件加速在我测试的时候，web 页面的动画掉帧。。默认就是硬件加速的了，不用手动去设置就行了。

```java
// 设置为软件加速
setLayerType(View.LAYER_TYPE_SOFTWARE, null)
```

4、WebView 104 版本貌似最低要安卓10才能安装了，所以要注意一下安卓版本兼容的问题。

5、其他安卓版本也可以参考一下，思路应该差不多。
