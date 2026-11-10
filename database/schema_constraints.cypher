// =====================================================================
// RÀNG BUỘC TOÀN VẸN & CHỈ MỤC - CSDL ĐỒ THỊ NEO4J ĐỀ TÀI 13
// =====================================================================

CREATE CONSTRAINT category_categoryId_unique IF NOT EXISTS FOR (c:Category) REQUIRE c.categoryId IS UNIQUE;
CREATE CONSTRAINT product_productId_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.productId IS UNIQUE;
CREATE CONSTRAINT customer_customerId_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.customerId IS UNIQUE;
CREATE CONSTRAINT customer_email_unique IF NOT EXISTS FOR (c:Customer) REQUIRE c.email IS UNIQUE;
CREATE CONSTRAINT bought_eventId_unique IF NOT EXISTS FOR ()-[r:BOUGHT]-() REQUIRE r.eventId IS UNIQUE;
CREATE CONSTRAINT viewed_eventId_unique IF NOT EXISTS FOR ()-[r:VIEWED]-() REQUIRE r.eventId IS UNIQUE;
CREATE CONSTRAINT guest_guestId_unique IF NOT EXISTS FOR (g:GuestSession) REQUIRE g.guestId IS UNIQUE;
CREATE CONSTRAINT search_eventId_unique IF NOT EXISTS FOR (s:SearchEvent) REQUIRE s.eventId IS UNIQUE;
