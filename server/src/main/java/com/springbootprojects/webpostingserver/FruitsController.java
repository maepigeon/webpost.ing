package com.springbootprojects.webpostingserver;

import org.json.JSONObject;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.concurrent.atomic.AtomicLong;

@RestController
public class FruitsController {
    private final AtomicLong fruitsCounter = new AtomicLong();

    @GetMapping("/api/fruitArray")
    @CrossOrigin(origins = "http://localhost:5173")
    public Fruits fruitArray() {
        JSONObject jo = new JSONObject();
        String[] fruits = {"Lemon", "Orange", "Lime", "GrapeFruit"};
        jo.put("fruits", Arrays.asList(fruits));
        return new Fruits(fruitsCounter.incrementAndGet(), jo.toString());
    }
}
