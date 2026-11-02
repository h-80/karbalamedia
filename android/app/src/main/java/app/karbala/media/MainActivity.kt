package app.karbala.media

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var fullscreenContainer: FrameLayout

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var lastBackPress = 0L

    private val host = "appassets.androidplatform.net"
    private val startUrl = "https://$host/index.html"

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(host)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.BLACK),
            navigationBarStyle = SystemBarStyle.dark(Color.BLACK)
        )
        super.onCreate(savedInstanceState)

        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        fullscreenContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        root.addView(webView)
        root.addView(fullscreenContainer)
        setContentView(root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            if (customView != null) {
                v.setPadding(0, 0, 0, 0)
            } else {
                val bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
                )
                val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            }
            WindowInsetsCompat.CONSUMED
        }

        setupWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    customView != null -> webView.webChromeClient?.onHideCustomView()
                    webView.canGoBack() -> webView.goBack()
                    else -> {
                        val now = System.currentTimeMillis()
                        if (now - lastBackPress < 2000) {
                            finish()
                        } else {
                            lastBackPress = now
                            Toast.makeText(
                                this@MainActivity, R.string.press_back_again, Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
            }
        })

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else webView.loadUrl(startUrl)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            textZoom = 100
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            // إزالة "wv" من الـ User-Agent حتى تعمل مواقع/مشغلات تحجب WebView
            userAgentString = userAgentString.replace("; wv", "")
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest
            ): Boolean {
                val uri = request.url
                val scheme = uri.scheme ?: return false
                // التنقل داخل التطبيق
                if (uri.host == host) return false
                // الـ iframes (يوتيوب، مشغلات خارجية...) تبقى داخل الصفحة
                if (!request.isForMainFrame) return false
                // أي رابط خارجي في الإطار الرئيسي يُفتح خارج التطبيق
                openExternal(uri)
                return true
            }

            override fun onRenderProcessGone(
                view: WebView, detail: RenderProcessGoneDetail
            ): Boolean {
                recreate()
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (customView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                fullscreenContainer.addView(
                    view,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
                fullscreenContainer.visibility = View.VISIBLE
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                setSystemBarsHidden(true)
                ViewCompat.requestApplyInsets(root)
            }

            override fun onHideCustomView() {
                val view = customView ?: return
                fullscreenContainer.removeView(view)
                fullscreenContainer.visibility = View.GONE
                customView = null
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                setSystemBarsHidden(false)
                ViewCompat.requestApplyInsets(root)
            }

            override fun getDefaultVideoPoster(): Bitmap? =
                Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        }
    }

    private fun setSystemBarsHidden(hidden: Boolean) {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (hidden) {
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
