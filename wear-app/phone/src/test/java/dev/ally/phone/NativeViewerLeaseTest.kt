package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test
class NativeViewerLeaseTest {
 @Test fun nativeCaptureOfferIsSingleUseBoundAndExpires(){
  var now=1000L;val lease=NativeViewerLease{now};assertFalse(lease.valid());lease.offer("viewer-123","a".repeat(64),30000)
  assertFalse(lease.valid("viewer-123","b".repeat(64)));assertTrue(lease.consume());assertFalse(lease.consume());assertTrue(lease.valid())
  now+=30000;assertFalse(lease.valid());assertFalse(lease.consume());lease.clear();assertEquals("",lease.token)
 }
 @Test fun noRestartReplayAndNoUnboundedLease(){
  val lease=NativeViewerLease{1000L};assertThrows(IllegalArgumentException::class.java){lease.offer("viewer-123","a".repeat(64),900001)}
  assertThrows(IllegalArgumentException::class.java){lease.offer("viewer-123","wrong",1000)};assertFalse(NativeViewerLease{1000L}.valid())
 }
}
