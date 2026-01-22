# Gunakan PostgreSQL versi 12
FROM postgres:12

# Environment variables
ENV POSTGRES_DB=pos_db
ENV POSTGRES_USER=pos_user
ENV POSTGRES_PASSWORD=pos_password

# Expose port default PostgreSQL
EXPOSE 5432
