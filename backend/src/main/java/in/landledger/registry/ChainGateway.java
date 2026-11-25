package in.landledger.registry;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.*;

@Component
class ChainGateway {
  final RestClient http;

  ChainGateway(@Value("${registry.bridge}") String url) {
    var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    var factory = new JdkClientHttpRequestFactory(client);
    factory.setReadTimeout(Duration.ofSeconds(15));
    http = RestClient.builder().baseUrl(url).requestFactory(factory).build();
  }

  JsonNode get(String path) {
    try {
      return http.get().uri(path).retrieve().body(JsonNode.class);
    } catch (RestClientException e) {
      throw Problems.offline();
    }
  }

  String recover(String message, String signature) {
    try {
      return http.post()
          .uri("/recover")
          .body(Map.of("message", message, "signature", signature))
          .retrieve()
          .body(JsonNode.class)
          .get("wallet")
          .asText();
    } catch (HttpClientErrorException e) {
      throw Problems.bad("Wallet signature could not be verified.");
    } catch (RestClientException e) {
      throw Problems.offline();
    }
  }
}
