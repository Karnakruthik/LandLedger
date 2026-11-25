package in.landledger.registry;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:h2:mem:registry;MODE=MySQL;DB_CLOSE_DELAY=-1",
      "spring.datasource.username=sa",
      "spring.datasource.password=",
      "registry.jwt-secret=only-for-automated-tests-of-session-authentication",
      "registry.admin-email="
    })
@AutoConfigureMockMvc
class RegistryTests {
  @Autowired MockMvc mvc;
  @Autowired PropertyService land;
  @Autowired RegistryRepository db;
  @Autowired ObjectMapper json;
  @Autowired Tokens tokens;

  @Test
  void anonymousAndForgedSessionsCannotAccessApplications() throws Exception {
    mvc.perform(get("/api/properties")).andExpect(status().isUnauthorized());
    var good = tokens.issue("unrecognized-account");
    mvc.perform(get("/api/properties").header("Authorization", "Bearer " + good + "x"))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/public/verify/LAND-UNKNOWN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.result").value("NOT_FOUND"));
  }

  @Test
  void publicSignupCannotGrantAdministratorAccess() throws Exception {
    mvc.perform(
            post("/api/auth/signup")
                .contentType("application/json")
                .content(
                    """
          {"name":"Test","email":"user@example.test","password":"abcdefghijklm","role":"ADMIN"}
          """))
        .andExpect(status().isBadRequest());
  }

  @Test
  void deedAndMetadataAreBothBoundToTheDigest() throws Exception {
    String id = UUID.randomUUID().toString(), wallet = "0x" + "1".repeat(40);
    db.update(
        "INSERT INTO accounts(id,name,email,pass_hash,role,wallet) VALUES(?,?,?,?,?,?)",
        id,
        "Citizen",
        "digest@example.test",
        "unused",
        "LANDOWNER",
        wallet);
    var fields =
        new LandApplication(
            "Citizen",
            "PRIVATE-TEST",
            "Test Village",
            "State",
            "District",
            "Survey 2",
            new BigDecimal("10.5"),
            "Agricultural",
            "Test street");
    var pdf =
        new MockMultipartFile(
            "document",
            "deed.pdf",
            "application/pdf",
            "%PDF-1.7\nTest deed\n%%EOF".getBytes(StandardCharsets.UTF_8));
    String parcel = land.submit(db.account(id), fields, pdf);
    String initial = land.digest(parcel);
    db.update("UPDATE properties SET area='11.5' WHERE id=?", parcel);
    assertNotEquals(initial, land.digest(parcel));
    db.update(
        "UPDATE properties SET area='10.5',document=? WHERE id=?",
        "another deed".getBytes(StandardCharsets.UTF_8),
        parcel);
    assertNotEquals(initial, land.digest(parcel));
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () ->
            land.submit(db.account(id), fields, new MockMultipartFile("document", new byte[] {0})));
  }
}
