Database and project configuration instructions:
The project is built to work with a PostgreSQL database, which must be running and configured for the project.
The jdbc database connection is configured in server/src/main/resources/application.properties. This must be updated with your database and credentials.

HTTP configuration:
By default,
-PostgreSQL uses port 5432 (localhost://5432/api)
-The front end uses port 5173 (http://localhost:5173/)
-The Spring Boot server uses port 8080 (http://localhost:8080)

SSL configuration (optional):
TODO

**Build Instructions:
**
The front-end is built with React and Node.js. 
Use the following command to run the front-end project:
npm run dev

The server is a Java Spring Boot project. 
Use the following command to run the server:
./mvnw spring-boot:run


NOTE: server/src/main/resources/application.properties should be configured as follows:
spring.application.name=webpostingserver

spring.datasource.url=jdbc:postgresql://localhost:5432/webposting
spring.datasource.username=postgres
spring.datasource.password=catsRcool12345

#spring.datasource.hikari.connection-timeout=20000
#spring.datasource.hikari.maximum-pool-size=5
