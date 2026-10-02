package com.note.companion

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * 随想便签 - 极轻量手机分享接收端 (Companion Activity)
 *
 * 核心逻辑：
 * 1. 监听 Android 系统分享动作 (ACTION_SEND)。
 * 2. 截获手机相册截屏 (image/*) 或 复制的文本/链接 (text/plain)。
 * 3. 后台线程向电脑端 FastAPI 服务发送 POST /api/share 请求。
 * 4. 弹窗提示“已同步至电脑画布”，完成退出，不打扰当前手机操作。
 */
class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val serverIp = getSharedPreferences("config", MODE_PRIVATE)
            .getString("server_ip", "192.168.1.6") ?: "192.168.1.6"
        val serverPort = 8088

        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action && type != null) {
            if (type.startsWith("image/")) {
                handleSendImage(intent, serverIp, serverPort)
            } else if ("text/plain" == type) {
                handleSendText(intent, serverIp, serverPort)
            }
        } else {
            // 正常点击图标打开时，显示简单的 IP 设置提示
            Toast.makeText(this, "随想便签同步服务运行中\n目标电脑: http://$serverIp:$serverPort", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun handleSendText(intent: Intent, serverIp: String, port: Int) {
        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        if (sharedText.isEmpty()) {
            Toast.makeText(this, "内容为空", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        Toast.makeText(this, "正在同步到电脑...", Toast.LENGTH_SHORT).show()

        thread {
            try {
                val url = URL("http://$serverIp:$port/api/share")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.doOutput = true
                conn.connectTimeout = 4000
                conn.readTimeout = 4000

                val jsonBody = "{\"text\": ${escapeJson(sharedText)}}"
                OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                    writer.write(jsonBody)
                    writer.flush()
                }

                val responseCode = conn.responseCode
                runOnUiThread {
                    if (responseCode == 200) {
                        Toast.makeText(this, "✅ 灵感已同步到电脑画布！", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this, "⚠️ 同步失败 (HTTP $responseCode)", Toast.LENGTH_SHORT).show()
                    }
                    finish()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "❌ 无法连接电脑，请检查是否在同一 Wi-Fi", Toast.LENGTH_LONG).show()
                    finish()
                }
            }
        }
    }

    private fun handleSendImage(intent: Intent, serverIp: String, port: Int) {
        val imageUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        if (imageUri == null) {
            Toast.makeText(this, "获取截图失败", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        Toast.makeText(this, "正在上传截图到电脑...", Toast.LENGTH_SHORT).show()

        thread {
            try {
                val boundary = "===Boundary${System.currentTimeMillis()}==="
                val url = URL("http://$serverIp:$port/api/share")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                conn.doOutput = true
                conn.connectTimeout = 6000
                conn.readTimeout = 6000

                val outputStream = conn.outputStream
                val writer = PrintWriter(OutputStreamWriter(outputStream, "UTF-8"), true)

                // Multipart File field
                writer.append("--$boundary\r\n")
                writer.append("Content-Disposition: form-data; name=\"file\"; filename=\"screenshot_${System.currentTimeMillis()}.png\"\r\n")
                writer.append("Content-Type: image/png\r\n\r\n")
                writer.flush()

                contentResolver.openInputStream(imageUri)?.use { input ->
                    val buffer = ByteArray(4096)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        outputStream.write(buffer, 0, bytesRead)
                    }
                    outputStream.flush()
                }

                writer.append("\r\n--$boundary--\r\n")
                writer.flush()

                val responseCode = conn.responseCode
                runOnUiThread {
                    if (responseCode == 200) {
                        Toast.makeText(this, "✅ 截图已同步到电脑画布！", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this, "⚠️ 上传失败 (HTTP $responseCode)", Toast.LENGTH_SHORT).show()
                    }
                    finish()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "❌ 无法连接电脑，请检查是否在同一 Wi-Fi", Toast.LENGTH_LONG).show()
                    finish()
                }
            }
        }
    }

    private fun escapeJson(str: String): String {
        return "\"" + str.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\b", "\\b")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t") + "\""
    }
}
