package dev.ally.phone.codex

import org.json.JSONObject
import org.json.JSONArray
import java.io.Closeable
import java.net.ServerSocket
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.Executors
import kotlinx.coroutines.runBlocking

/** Private stateless Streamable HTTP MCP. No public listener, browser Origin or arbitrary methods. */
internal class PhoneMcpServer(private val tools:()->JSONArray,private val call:suspend (String,JSONObject)->JSONObject):Closeable {
    private val secret=UUID.randomUUID().toString()
    private val server=ServerSocket().apply {bind(InetSocketAddress("127.0.0.1",0),4)}
    private val clients=java.util.concurrent.ConcurrentHashMap.newKeySet<Socket>()
    private val workers=Executors.newFixedThreadPool(4)
    val url="http://127.0.0.1:${server.localPort}/$secret"
    private val accept= kotlin.concurrent.thread(name="AllyPhoneMcp",isDaemon=true) {
        while(!server.isClosed) try { val c=server.accept(); if(!c.inetAddress.isLoopbackAddress || clients.size>=4)c.close() else {clients.add(c);workers.execute {serve(c)}} } catch(_:Exception){}
    }
    private fun serve(c:Socket) {
        try { c.soTimeout=15000; val input=c.getInputStream(); fun line():String {val b=StringBuilder();while(b.length<4096){val n=input.read();check(n>=0);if(n==10)return b.toString().trimEnd('\r');b.append(n.toChar())};error("Headers too large")}
            val request=line().split(' '); val h=mutableMapOf<String,String>();var size=0
            while(true) {val v=line();if(v.isEmpty())break;size+=v.length;check(size<=8192);val pos=v.indexOf(':');check(pos>0);h[v.substring(0,pos).lowercase()]=v.substring(pos+1).trim()}
            check(request.size==3 && request[0]=="POST" && request[1]=="/$secret" && !h.containsKey("origin") && !h.containsKey("transfer-encoding"))
            val length=h["content-length"]?.toIntOrNull()?:0;check(length in 1..262144)
            val body=ByteArray(length);var off=0;while(off<length){val n=input.read(body,off,length-off);check(n>0);off+=n}
            val rpc=JSONObject(body.toString(Charsets.UTF_8));val id=rpc.opt("id")
            val result=when(rpc.optString("method")) {
                "initialize"->JSONObject().put("protocolVersion","2025-03-26").put("capabilities",JSONObject().put("tools",JSONObject().put("listChanged",false))).put("serverInfo",JSONObject().put("name","ally_phone").put("version","1"))
                "notifications/initialized","notifications/cancelled"->null
                "ping"->JSONObject()
                "tools/list"->JSONObject().put("tools",tools())
                "tools/call"->{val p=rpc.getJSONObject("params");try{runBlocking{call(p.getString("name"),p.optJSONObject("arguments")?:JSONObject())}}catch(e:Exception){JSONObject().put("isError",true).put("content",JSONArray().put(JSONObject().put("type","text").put("text",e.message?.take(300)?:"Tool failed")))}}
                else->throw IllegalArgumentException("Unsupported MCP method")
            }
            val response=if(id==null||id==JSONObject.NULL) "" else JSONObject().put("jsonrpc","2.0").put("id",id).put("result",result?:JSONObject()).toString()
            val bytes=response.toByteArray();c.getOutputStream().write("HTTP/1.1 ${if(response.isEmpty())"202 Accepted" else "200 OK"}\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray());c.getOutputStream().write(bytes)
        } catch(_:Exception) {runCatching {c.getOutputStream().write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())}} finally {clients.remove(c);runCatching{c.close()}}
    }
    override fun close(){server.close();clients.toList().forEach{runCatching{it.close()}};workers.shutdownNow();accept.join(1000)}
}
