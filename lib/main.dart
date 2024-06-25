import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shopping_app/home.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Provider( /// Task of this provider is to store data.
      create: (context) => 'Hello World',
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Shopping App',
        theme: ThemeData(
          textTheme: TextTheme(
              bodyMedium: GoogleFonts.lato(
                  textStyle: const TextStyle(fontWeight: FontWeight.bold)),
              titleMedium: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            bodySmall: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 16
            ),
            titleLarge: const TextStyle(fontWeight: FontWeight.bold, fontSize: 35)
          ),
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
              seedColor: const Color.fromRGBO(254, 206, 1, 1),
              primary: const Color.fromRGBO(254, 206, 1, 1)),
          appBarTheme: const AppBarTheme(
            titleTextStyle: TextStyle(
              fontSize: 20,
              color: Colors.black,
            ),
          ),
          inputDecorationTheme: const InputDecorationTheme(
              hintStyle: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
              prefixIconColor: Color.fromRGBO(119, 119, 119, 1)),
        ),
      
        /// Used for defining the themes and fonts to overall app.
        home: const HomePage(),
      ),
    );
  }
}
