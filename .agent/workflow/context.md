# Project Context

## Tech Stack
- Frontend: Next.js 15 (App Router)
- Database: Postgres SQL
- Auth: Clerk

## Architecture
- `/components`: contains all the Frontend and Backend components
- `/src/app/RaspiBackend`: Is the represnetation of how the python script for the pi is structured.
- `/src/components/styles`: contains all the frontend dashboard elements used to send to the backend located in the Pi

## Core Goal
Dashboard controling the Raspberry pi Zero running a Postgres SQL database that controls a CNC motor that moves the microscope with a bluelight attachment. The pi is connected to the internet and can be controlled remotely. The pi is also connected to the microscope via USB and can be controlled remotely. The pi is also connected to the arduino via USB and can be controlled remotely. The arduino is connected to the CNC motor and can be controlled remotely. The arduino is also connected to the bluelight attachment and can be controlled remotely. The Frontend dashboard allows creating a routine which is uploaded onto the Pi to control the microscope at any time period through a cronjob. 