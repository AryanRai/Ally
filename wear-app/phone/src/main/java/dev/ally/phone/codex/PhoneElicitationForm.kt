package dev.ally.phone.codex

import org.json.JSONObject

/** Only bounded, explicitly rendered primitive forms; no hidden/default answers. */
internal class PhoneElicitationForm(schema:JSONObject){
    data class Field(val id:String,val title:String,val type:String,val required:Boolean,val options:List<String>,val min:Double?,val max:Double?)
    val fields:List<Field>
    init {
        require(schema.toString().length<=20000 && schema.optString("type","object")=="object") {"Unsupported approval form"}
        val props=schema.optJSONObject("properties")?:JSONObject();require(props.length()<=16)
        val required=schema.optJSONArray("required")?.let{a->(0 until a.length()).map{a.getString(it)}.toSet()}?:emptySet()
        fields=props.keys().asSequence().map{id->
            require(id.length in 1..100);val p=props.getJSONObject(id);val type=p.optString("type","string")
            require(type in setOf("string","boolean","number","integer") && !p.has("oneOf") && !p.has("anyOf")) {"Unsupported approval field"}
            val options=p.optJSONArray("enum")?.let{a->require(a.length() in 1..24);(0 until a.length()).map{a.getString(it).also{require(it.length<=500)}}}?:emptyList()
            Field(id,p.optString("title",id).take(200),type,id in required,options,p.opt("minimum")?.let{(it as? Number)?.toDouble()},p.opt("maximum")?.let{(it as? Number)?.toDouble()})
        }.toList()
        require(required.all{id->fields.any{it.id==id}})
    }
    fun content(values:Map<String,String>):JSONObject?=runCatching {
        val out=JSONObject();fields.forEach{f->
            val value=values[f.id]
            if(value==null){require(!f.required);return@forEach}
            require(value.length<=4000 && (f.options.isEmpty()||value in f.options))
            val parsed:Any=when(f.type){"boolean"->value.toBooleanStrict();"integer"->value.toLong();"number"->value.toDouble().also{require(it.isFinite())};else->value}
            if(parsed is Number){f.min?.let{require(parsed.toDouble()>=it)};f.max?.let{require(parsed.toDouble()<=it)}}
            out.put(f.id,parsed)
        };out
    }.getOrNull()
}
