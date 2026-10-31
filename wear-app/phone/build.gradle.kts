import java.security.MessageDigest
import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}
// Phone runtime is bundled by default. -PphoneCodex=false produces the smaller PC-only app.
val codexProbe = providers.gradleProperty("codexProbe").orNull == "true"
val phoneCodex = providers.gradleProperty("phoneCodex").orNull != "false"
check(!codexProbe || gradle.startParameter.taskNames.none { it.contains("release", ignoreCase = true) }) {
    "The Codex probe is debug-only; do not combine -PcodexProbe=true with release tasks."
}
val probeJni = layout.buildDirectory.dir("generated/codexProbe/jniLibs")
val prepareCodexProbe by tasks.registering {
    val archive = layout.buildDirectory.file("codexProbe/codex-0.166.0.tar.gz")
    outputs.dir(probeJni)
    doLast {
        fun sha(file: java.io.File): String {
            val md = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(65536)
                while (true) { val n = input.read(buffer); if (n < 0) break; md.update(buffer, 0, n) }
            }
            return md.digest().joinToString("") { "%02x".format(it) }
        }
        val packed = archive.get().asFile
        val archiveSha = "94eb707605ec2646b2e05b7edf7c4e7b3ccf02b16237c34ae9beb8cfb7f810a9"
        packed.parentFile.mkdirs()
        if (!packed.exists() || sha(packed) != archiveSha) {
            packed.delete()
            val connection = URI("https://github.com/openai/codex/releases/download/rust-v0.166.0/codex-aarch64-unknown-linux-musl.tar.gz").toURL().openConnection()
            connection.connectTimeout = 30000; connection.readTimeout = 60000
            connection.getInputStream().use { input -> packed.outputStream().use { input.copyTo(it) } }
        }
        check(sha(packed) == archiveSha) { "Official Codex archive SHA-256 mismatch" }
        val binary = tarTree(resources.gzip(packed)).matching { include("codex-aarch64-unknown-linux-musl") }.singleFile
        check(sha(binary) == "f2e6c980c937e734644bed1b4a9a018d3e63a0ccbe71aafc85c86a8c6e4b462a") { "Codex executable SHA-256 mismatch" }
        val destination = probeJni.get().file("arm64-v8a/libcodex.so").asFile
        destination.parentFile.mkdirs(); binary.copyTo(destination, overwrite = true)
    }
}
android {
    namespace = "dev.ally.phone"
    compileSdk = 36
    defaultConfig { applicationId = "dev.ally.phone"; minSdk = 30; targetSdk = 36; versionCode = 6; versionName = "0.1.5" }
    buildFeatures { compose = true; buildConfig = true }
    sourceSets["main"].kotlin.srcDir("../device-common/src/main/java")
    sourceSets["main"].res.srcDir("../app/src/main/res")
    sourceSets["main"].res.srcDir("../device-common/src/main/res")
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    if (codexProbe || phoneCodex) {
        sourceSets["main"].jniLibs.srcDir(probeJni.get().asFile)
        // Android extracts the executable into nativeLibraryDir (not writable app data).
        packaging.jniLibs.useLegacyPackaging = true
        packaging.jniLibs.keepDebugSymbols.add("**/libcodex.so")
    }
}
if (codexProbe || phoneCodex) {
    tasks.configureEach {
        if (name.startsWith("merge") && name.endsWith("JniLibFolders")) dependsOn(prepareCodexProbe)
    }
}
dependencies {
    implementation("com.github.gkonovalov.android-vad:silero:2.0.10")
    implementation("org.commonmark:commonmark:0.24.0")
    implementation("org.commonmark:commonmark-ext-gfm-tables:0.24.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("androidx.compose.material3:material3:1.3.2")
    implementation("androidx.compose.foundation:foundation:1.8.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
