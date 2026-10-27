package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test
class ReviewSwipeConsentTest {
 @Test fun proximityAndRepeatedOffersNeverAuthorizeOrExtendDeadline(){val c=ReviewSwipeConsent();c.offer(100);c.offer(8000);assertFalse(c.authorized(8000));assertTrue(c.expired(8101));c.confirm(8101,true);assertFalse(c.authorized(8101))}
 @Test fun freshSwipeRequiresEligibleOfferAndIsRevokedByCancellation(){val c=ReviewSwipeConsent();c.confirm(0,true);assertFalse(c.authorized(0));c.offer(100);c.confirm(200,false);assertFalse(c.authorized(200));c.confirm(300,true);assertTrue(c.authorized(300));c.clear();assertFalse(c.authorized(301))}
}
