# Dynamic-Digit-Recognition-BUDDHI

## Link to updated project
https://github.com/catsandsoup32/HME_Training

## Dataset Credit
Most of the data was downloaded from this [Kaggle dataset](https://www.kaggle.com/datasets/xainano/handwrittenmathsymbols), which was itself parsed, extracted and modified from a CROHME dataset. Many thanks to the authors!

## Main Dependencies
```
pytorch 
opencv
sympy
```
## Link to Demo
https://youtu.be/Hp_F7IELwfE

## How it Works
- User draws their expression (NEW_draw.py), then, from this, OpenCV-generated bounding box coordinates are sorted by x-coordinate, combined if they overlap (for cases such as 8, =, i, j, etc.), and returned as an array of nested lists
- This list is further processed to annotate each bounding box list with a subscript/exponent/bounds marker if needed, and then there is a screenshot taken of each bounding box element
- The bounding box screenshot list is fed into the model one-by-one for inference (note the image needs to be transformed the same way as in training), and then the output here is a list of predicted symbols along with their subscript/exponent/bounds annotation
- Finally, this symbol list is parsed into LaTeX (toSympy.py), with a recursive process happening at each instance of special symbols like \int or \frac, as well as elements with the subscript/exponent/bounds annotations, and the final LaTeX expression is rendered on screen, copied to clipboard, and also solved numerically via the Sympy libary in parse_and_solve.py

## Other
- This project was completely trained from scratch and designed in less than 2 weeks as the open-ended final project of the UCSD [SPIS program](https://spis.ucsd.edu/)
- Dropout and data augmentation were introduced to combat overfitting, but for better progress I am working on a much more end-to-end transformer-based model (able to get context by itself and train on entire expressions rather than single symbols) that will soon be linked here
