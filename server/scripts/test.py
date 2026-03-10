PATH = "server/DATA/Output/16s/normalized_otus.csv"

with open(PATH, "r") as f:
    lines = f.readlines()
    matrix = []
    for line in lines:
        row = line.strip().split(",")
        matrix.append(row)
    
    for i in range(1, len(matrix)):
        total = 0
        for j in range(1, len(matrix[0])):
            total += float(matrix[i][j])
        print(matrix[i][0], total)