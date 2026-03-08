PATH = "server/DATA/Output/16s/TM_Components/11_components.csv"

with open(PATH, "r") as f:
    lines = f.readlines()
    matrix = []
    for line in lines:
        row = line.strip().split(",")
        matrix.append(row)
    
    for i in range(1, len(matrix[0])):
        total = 0
        for j in range(1, len(matrix)):
            total += float(matrix[j][i])
        avg = total / (len(matrix) - 1)
        print(matrix[0][i], avg)