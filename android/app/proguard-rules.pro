# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# @capgo/capacitor-social-login содержит optional Facebook provider.
# В Mentala используется Google login, а Facebook SDK не подключён.
# Без этих suppress-правил R8 валит release build на missing optional classes.
-dontwarn com.facebook.AccessToken$AccessTokenRefreshCallback
-dontwarn com.facebook.AccessToken
-dontwarn com.facebook.CallbackManager$Factory
-dontwarn com.facebook.CallbackManager
-dontwarn com.facebook.FacebookCallback
-dontwarn com.facebook.FacebookSdk
-dontwarn com.facebook.GraphRequest$GraphJSONObjectCallback
-dontwarn com.facebook.GraphRequest
-dontwarn com.facebook.GraphRequestAsyncTask
-dontwarn com.facebook.login.LoginBehavior
-dontwarn com.facebook.login.LoginManager
