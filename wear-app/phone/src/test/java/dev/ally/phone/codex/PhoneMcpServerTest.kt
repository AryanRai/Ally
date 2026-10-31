package dev.ally.phone.codex

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject
import org.json.JSONArray
import java.net.Socket
import java.net.URI

class PhoneMcpServerTest {
    private fun post(url:String,path:String?=null,origin:Boolean=false,method:String="tools/list"):String {
        val u=URI(url);return Socket("127.0.0.1",u.port).use {s->s.soTimeout=3000
            val b=JSONObject().put("jsonrpc","2.0").put("id",1).put("method",method).toString().toByteArray()
            s.getOutputStream().write("POST ${path?:u.path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: ${b.size}\r\n${if(origin)"Origin: https://evil.test\r\n" else ""}\r\n".toByteArray());s.getOutputStream().write(b);s.getInputStream().bufferedReader().readText()
        }
    }
    @Test fun toolsAreOnlyAvailableWithSecretPathAndNoOrigin(){PhoneMcpServer({JSONArray().put(JSONObject().put("name","phone_control"))},{_,_->JSONObject()}).use{s->
        assertTrue(post(s.url).contains("phone_control"));assertTrue(post(s.url,"/wrong").startsWith("HTTP/1.1 403"));assertTrue(post(s.url,origin=true).startsWith("HTTP/1.1 403"));assertTrue(post(s.url,method="initialize").contains("protocolVersion"))}}
    @Test fun closeStopsListener(){val s=PhoneMcpServer({JSONArray()},{_,_->JSONObject()});val port=URI(s.url).port;s.close();assertThrows(java.net.ConnectException::class.java){Socket("127.0.0.1",port).close()}}
}
