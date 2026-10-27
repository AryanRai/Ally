package dev.ally.phone
import dev.ally.device.MaintenanceLease
import org.junit.Assert.*
import org.junit.Test
class MaintenanceLeaseTest {
 @Test fun finiteLeaseExpiresAndStopReleasesWithoutRestartReplay(){
  var now=1000L;val lease=MaintenanceLease{now};assertFalse(lease.active());lease.start();assertEquals(600000L,lease.remaining())
  now+=599999;assertTrue(lease.active());now++;assertFalse(lease.active());lease.start(3000);lease.stop();assertEquals(0L,lease.remaining())
  assertFalse(MaintenanceLease{now}.active())
 }
 @Test fun rejectsUnboundedOrInvalidRequests(){
  val lease=MaintenanceLease{1000L};listOf(0L,999L,600001L,Long.MAX_VALUE).forEach{duration->assertThrows(IllegalArgumentException::class.java){lease.start(duration)}}
 }
}
