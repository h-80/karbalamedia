plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.karbala.media"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.karbala.media"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    // نسخة واحدة (Universal APK) تعمل على كل المعالجات: arm64 / armv7 / x86 / x86_64
    // لا توجد مكتبات native، ولا يوجد splits.

    val ksFile: String? = System.getenv("KEYSTORE_FILE")
    val hasKeystore = ksFile != null && File(ksFile).exists()

    signingConfigs {
        if (hasKeystore) {
            create("release") {
                storeFile = File(ksFile!!)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (hasKeystore) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    lint { abortOnError = false }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
