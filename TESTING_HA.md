# High Availability Architecture Testing Plan

This document outlines the steps to validate the fault tolerance and high availability of the QuizMaster Pro application.

## 1. Environment Setup

Clean start the environment:
```powershell
docker-compose down -v
docker-compose up --build
```
*Wait for all services to be healthy (check `docker ps` or Docker Desktop).*

## 2. Validation Scenarios

### Scenario A: Node.js App Crash Recovery

**Objective:** specific container failure should not stop the service, and it should restart automatically.

1.  **Check Status:** Open `http://localhost/api/health` in browser. It should return success.
2.  **Kill one instance:**
    ```powershell
    docker kill kahoot-app1-1
    # OR depending on container name
    docker kill kahoot_app1_1
    ```
3.  **Verify Availability:** immediately refresh `http://localhost/api/health`. It should still work (served by `app2`).
4.  **Verify Recovery:** Watch `docker ps`. `app1` should restart automatically within seconds (due to `restart: always`).

### Scenario B: Redis Master Failover

**Objective:** If the Redis Master fails, Sentinel should promote the Slave to Master, and the App should reconnect.

1.  **Identify Master:**
    ```powershell
    docker exec -it kahoot-redis-master-1 redis-cli role
    # Should output "master"
    ```
2.  **Kill Master:**
    ```powershell
    docker stop kahoot-redis-master-1
    ```
3.  **Wait for Failover:** Wait about 10-15 seconds (Sentinel monitoring time).
4.  **Verify New Master:**
    ```powershell
    docker exec -it kahoot-redis-slave-1 redis-cli role
    # Should now output "master"
    ```
5.  **Verify App Functionality:** Try to login or join a quiz. The app logs should show reconnection (`ioredis` handles this).

### Scenario C: MongoDB Primary Election

**Objective:** If MongoDB Primary fails, a Secondary should be elected Primary.

1.  **Find Primary:**
    ```powershell
    docker exec -it kahoot-mongo1-1 mongosh --eval "rs.status()"
    ```
    *Look for the member with `stateStr: "PRIMARY"`.*
2.  **Stop Primary:**
    ```powershell
    docker stop kahoot-mongo1-1
    ```
3.  **Wait:** Wait 10-20 seconds.
4.  **Verify New Primary:**
    ```powershell
    docker exec -it kahoot-mongo2-1 mongosh --eval "rs.status()"
    ```
    *One of the remaining nodes (mongo2 or mongo3) should become PRIMARY.*
5.  **Verify Writes:** Create a new User or Quiz. It should succeed.

### Scenario D: Load Balancing & Sticky Sessions

**Objective:** Ensure users stick to one server for WebSockets (`ip_hash`) but load is distributed.

1.  **Check Logs:**
    ```powershell
    docker-compose logs -f app1 app2
    ```
2.  **Access App:** Open the app in a browser. Only ONE app server should log your requests (due to `ip_hash`).
3.  **Incognito Mode:** Open an Incognito window. You *might* hit the other server (50/50 chance strictly speaking, generally hashes IP). *Note: Since you are on localhost, your IP is always 127.0.0.1, so you will likely ALWAYS hit app1 unless you test from another device on the network.*

## 3. Maintenance

To stop everything:
```powershell
docker-compose down
```
To wipe data:
```powershell
docker-compose down -v
```
