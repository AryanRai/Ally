package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test
class MediaHandoffRulesTest {
 @Test fun validatesCanonicalVideoIdentityWithoutGuessingTitles(){assertEquals("https://www.youtube.com/watch?v=abcdefghijk",MediaHandoffRules.youtube("https://youtu.be/abcdefghijk?t=45"));assertNull(MediaHandoffRules.youtube("https://youtube.com.evil.test/watch?v=abcdefghijk"));assertNull(MediaHandoffRules.youtube("https://user@youtube.com/watch?v=abcdefghijk"));assertNull(MediaHandoffRules.youtube("http://youtu.be/abcdefghijk"));assertNull(MediaHandoffRules.youtube("some video title"))}
 @Test fun extrapolatesOnlyFreshPositionsAndBoundsDuration(){assertEquals(5000L,MediaHandoffRules.position(3000,1000,3000,1f,true,10000));assertEquals(4000L,MediaHandoffRules.position(3000,1000,3000,1f,true,4000));assertEquals(3000L,MediaHandoffRules.position(3000,1000,3000,1f,false,0));assertNull(MediaHandoffRules.position(-1,1000,3000,1f,true,0));assertNull(MediaHandoffRules.position(0,1000,400000,1f,true,0))}
}
